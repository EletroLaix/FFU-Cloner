param(
	[ValidateSet('environment', 'list', 'clone')]
	[string]$Action,
	[string]$RequestJson = '{}'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$request = $RequestJson | ConvertFrom-Json
$sessionLog = $null

# Load helpers in this script scope so they share the request and session log.
. (Join-Path $PSScriptRoot 'DiskInventory.ps1')
. (Join-Path $PSScriptRoot 'ImageFiles.ps1')
. (Join-Path $PSScriptRoot 'OperationSupport.ps1')
. (Join-Path $PSScriptRoot 'Dism.ps1')
. (Join-Path $PSScriptRoot 'Capture.ps1')
. (Join-Path $PSScriptRoot 'DiskState.ps1')

try {
	$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
	$principal = [Security.Principal.WindowsPrincipal]$identity
	$admin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
	if ($Action -eq 'environment') {
		[pscustomobject]@{
			admin = $admin
		} | ConvertTo-Json -Compress
		exit 0
	}
	if ($Action -eq 'list') {
		ConvertTo-Json -InputObject @(Get-Disks) -Depth 4 -Compress
		exit 0
	}
	if (!$admin) {
		throw 'Run FFU Cloner as administrator.'
	}
	if ($request.mode -notin @('apply', 'capture')) {
		throw 'Invalid operation.'
	}
	if ($request.confirmation -cne "DISK $($request.disk.number)") {
		throw 'Invalid disk confirmation.'
	}
	if ($request.disk.number -isnot [int] -or $request.disk.number -lt 0) {
		throw 'Invalid disk number.'
	}

	$mutex = [Threading.Mutex]::new($false, 'Global\FFUCloner.DISM')
	$acquired = $false
	$inputFile = $null
	try {
		try {
			$acquired = $mutex.WaitOne(0)
		}
		catch [Threading.AbandonedMutexException] {
			$acquired = $true
		}
		if (!$acquired) {
			throw 'Another FFU Cloner process is already running.'
		}
		$image = Image-Path $request.image ($request.mode -eq 'apply')
		[IO.Directory]::CreateDirectory($request.logDirectory) | Out-Null
		$sessionName = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' +
			[Guid]::NewGuid().ToString('N').Substring(0, 8)
		$session = Join-Path $request.logDirectory $sessionName
		$sessionLog = $session + '.txt'
		Report ('FFU_LOG:' + $sessionLog)
		Report "FFU Cloner $($request.version) | $($request.mode) | $(Identity $request.disk) | $image"
		foreach ($file in @($image, $sessionLog) + @($request.appPaths)) {
			if ((Path-Disk $file) -eq $request.disk.number) {
				throw 'The app, image, and logs must be on another disk.'
			}
		}
		if ($request.mode -eq 'apply') {
			# FileShare.Read prevents changes/deletion while inspecting and applying.
			$inputFile = [IO.File]::Open(
				$image,
				[IO.FileMode]::Open,
				[IO.FileAccess]::Read,
				[IO.FileShare]::Read
			)
			Report 'FFU_STAGE:Inspecting image'
			Dism @(
				'/English',
				'/Get-ImageInfo',
				"/ImageFile:$image",
				"/LogPath:$session-inspect.log"
			)
		}
		else {
			$volume = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($image))
			if ($volume.DriveFormat -notin @('NTFS', 'ReFS')) {
				throw 'Save the FFU on an NTFS or ReFS volume.'
			}
			if ($volume.AvailableFreeSpace -lt 2GB) {
				throw 'At least 2 GiB of free space is required to start capture.'
			}
		}
		$current = Get-Disks | Where-Object number -eq $request.disk.number
		Check-Disk $request.disk $current
		Check-Cancel
		$originalState = Save-DiskState $current
		Report ('Paths before preparation: ' + ($current.accessPaths -join ' | '))
		try {
			Report 'FFU_STAGE:Preparing disk'
			Prepare-Disk $current
			$current = Get-Disks | Where-Object number -eq $request.disk.number
			if ($request.mode -eq 'apply' -and $current -and !$current.offline) {
				$current.volumesOffline = Test-VolumesOffline $current.number
			}
			Check-Disk $request.disk $current ($request.mode -eq 'apply')
			if ($request.mode -eq 'capture' -and $current.offline) {
				throw 'Capture requires an online source disk.'
			}
			$image = Image-Path $image ($request.mode -eq 'apply')
			$device = '\\.\PhysicalDrive' + $current.number
			if ($request.mode -eq 'capture') {
				Capture-Image $image $device $session
			}
			else {
				Report 'FFU_STAGE:Restoring'
				Dism @(
					'/English',
					'/Apply-FFU',
					"/ImageFile:$image",
					"/ApplyDrive:$device",
					"/LogPath:$session-dism.log"
				)
			}
		}
		catch {
			try {
				Report ('Operation error: ' + $_.Exception.Message)
			}
			catch {
				# Preserve the original error if the session log is unavailable.
			}
			throw
		}
		finally {
			try {
				Restore-DiskState $originalState
				Report 'Original disk state restored.'
			}
			catch {
				throw "Could not restore the original disk state: $($_.Exception.Message)"
			}
		}
		if ($request.mode -eq 'apply') {
			Restore-DriveLetters $originalState
		}
		Report ('FFU_RESULT:' + (@{
			success = $true
			image = $image
			logPath = $sessionLog
		} | ConvertTo-Json -Compress))
	}
	finally {
		if ($inputFile) {
			$inputFile.Dispose()
		}
		if ($acquired) {
			$mutex.ReleaseMutex()
		}
		if ($mutex) {
			$mutex.Dispose()
		}
	}
}
catch {
	if ($_.Exception -is [OperationCanceledException]) {
		Report 'FFU_CANCELLED'
	}
	$message = $_.Exception.Message
	[Console]::Out.WriteLine('FFU_ERROR:' + $message)
	if ($sessionLog) {
		try {
			Report ('ERROR: ' + $message)
		}
		catch {
			# Preserve the original error if the session log is unavailable.
		}
	}
	exit 1
}
