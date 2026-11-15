param([ValidateSet('environment', 'list', 'clone')][string]$Action, [string]$RequestJson = '{}')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$request = $RequestJson | ConvertFrom-Json
$sessionLog = $null

function Get-Disks {
	$paging = @(Get-CimInstance Win32_PageFileUsage | ForEach-Object { $_.Name.Substring(0, 2) })
	$partitions = @(Get-Partition)
	$devices = @(Get-CimInstance Win32_DiskDrive)
	@(Get-Disk | ForEach-Object {
		$d = $_
		$parts = @($partitions | Where-Object DiskNumber -eq $d.Number)
		$media = $devices | Where-Object Index -eq $d.Number
		[pscustomobject]@{
			number = [int]$d.Number; name = [string]$d.FriendlyName
			serial = ([string]$d.SerialNumber).Trim(); uniqueId = [string]$d.UniqueId
			size = [UInt64]$d.Size; bus = [string]$d.BusType; style = [string]$d.PartitionStyle
			system = [bool]$d.IsSystem; boot = [bool]$d.IsBoot; offline = [bool]$d.IsOffline
			readOnly = [bool]$d.IsReadOnly; removable = [bool]($media.Capabilities -contains 7)
			paging = [bool](@($parts | Where-Object { $_.DriveLetter -and ($paging -contains ([string]$_.DriveLetter + ':')) }).Count -gt 0)
			volumesOffline = [bool](@($parts | Where-Object { $_.Type -ne 'Reserved' -and !$_.IsOffline }).Count -eq 0)
			accessPaths = [string[]]@($parts | ForEach-Object { $_.AccessPaths })
		}
	})
}

function Identity($d) { "$($d.number)|$($d.uniqueId)|$($d.serial)|$($d.size)|$($d.name)|$($d.bus)|$($d.removable)" }

function Check-Disk($expected, $current, [bool]$requireOffline = $false) {
	if (!$current -or (Identity $expected) -cne (Identity $current)) { throw 'The disk has changed or was disconnected. Refresh the selection.' }
	if ($current.system -or $current.boot -or $current.paging) { throw 'System, boot, or paging disk: operation blocked.' }
	if ([string]::IsNullOrWhiteSpace([string]$current.uniqueId) -or $current.size -le 0) { throw 'Disk identity unavailable.' }
	if ($request.mode -eq 'apply' -and $current.readOnly) { throw 'Disk is read-only.' }
	if ($request.mode -eq 'capture' -and $current.style -ne 'GPT') { throw 'FFU capture requires a GPT disk.' }
	if ($requireOffline -and !$current.offline -and !$current.volumesOffline) { throw 'Disk or volumes are not offline: DISM will not start.' }
}

function Image-Path([string]$value, [bool]$mustExist) {
	if ($value -notmatch '^[a-zA-Z]:\\' -or $value.Substring(2).Contains(':')) { throw 'Use an FFU file on a local volume with a drive letter.' }
	$full = [IO.Path]::GetFullPath($value)
	if ([IO.Path]::GetExtension($full) -ine '.ffu') { throw 'The file must have the .ffu extension.' }
	if ($mustExist -and ![IO.File]::Exists($full)) { throw 'Image not found.' }
	if (!$mustExist) { Check-Output $full }
	$directory = [IO.Path]::GetDirectoryName($full)
	if (![IO.Directory]::Exists($directory)) { throw 'The destination directory does not exist.' }
	$item = if ($mustExist) { $full } else { $directory }
	while ($item) {
		if (([IO.File]::GetAttributes($item) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Links, junctions, and mount points are not supported for the FFU file.' }
		$item = [IO.Path]::GetDirectoryName($item)
	}
	return $full
}

function Check-Output([string]$image) {
	$exists = [IO.File]::Exists($image)
	if (!$request.overwrite) {
		if (Test-Path -LiteralPath $image) { throw 'The file already exists. Choose a new name.' }
		return
	}
	if (!$exists) { throw 'The selected image has changed. Select it again.' }
	$file = Get-Item -LiteralPath $image -Force
	if ($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
		$file.Length -ne $request.overwrite.size -or
		([DateTimeOffset]$file.LastWriteTimeUtc).ToUnixTimeMilliseconds() -ne $request.overwrite.modified) {
		throw 'The selected image has changed. Select it again.'
	}
}

function Path-Disk([string]$value) {
	if ($value -notmatch '^[a-zA-Z]:\\') { throw 'Cannot identify the local path.' }
	$probe = [IO.Path]::GetFullPath($value)
	if (!(Test-Path -LiteralPath $probe)) { $probe = [IO.Path]::GetDirectoryName($probe) }
	while ($probe) {
		if (([IO.File]::GetAttributes($probe) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'The app, image, and logs must use paths without links or mount points.' }
		$probe = [IO.Path]::GetDirectoryName($probe)
	}
	$part = @(Get-Partition -DriveLetter $value.Substring(0, 1))
	if ($part.Count -ne 1) { throw 'Cannot identify the volume.' }
	[int]$part[0].DiskNumber
}

function Report([string]$text) {
	if ($sessionLog) { [IO.File]::AppendAllText($sessionLog, "$(Get-Date -Format o) $text`r`n", [Text.UTF8Encoding]::new($false)) }
	[Console]::Out.WriteLine($text)
}

function Check-Cancel {
	if ($request.cancelFile -and [IO.File]::Exists($request.cancelFile)) {
		throw [OperationCanceledException]::new('Operation cancelled.')
	}
}

function Dism([string[]]$arguments) {
	Check-Cancel
	$measureSpeed = $arguments -contains '/Capture-FFU' -or $arguments -contains '/Apply-FFU'
	$previous = $null
	if ($measureSpeed) {
		try {
			. (Join-Path $PSScriptRoot 'DiskPerformance.ps1')
			$previous = [FfuDiskPerformance]::Read($request.disk.number)
		} catch { Report 'FFU_SPEED:unavailable' }
	}
	$clock = [Diagnostics.Stopwatch]::StartNew()
	$lastSample = $clock.Elapsed.TotalSeconds
	Report ('DISM ' + (($arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '))
	$info = [Diagnostics.ProcessStartInfo]::new()
	$info.FileName = "$env:WINDIR\System32\dism.exe"
	$info.Arguments = ($arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
	$info.UseShellExecute = $false
	$info.CreateNoWindow = $true
	$info.RedirectStandardOutput = $true
	$info.RedirectStandardError = $true
	$process = [Diagnostics.Process]::Start($info)
	try {
		$readers = @($process.StandardOutput, $process.StandardError)
		$pending = @($readers[0].ReadLineAsync(), $readers[1].ReadLineAsync())
		while ($pending[0] -or $pending[1] -or !$process.HasExited) {
			if ($request.cancelFile -and [IO.File]::Exists($request.cancelFile)) {
				Check-Cancel
			}
			for ($i = 0; $i -lt 2; $i++) {
				if ($pending[$i] -and $pending[$i].IsCompleted) {
					$line = $pending[$i].GetAwaiter().GetResult()
					if ($null -eq $line) { $pending[$i] = $null }
					else { Report $line; $pending[$i] = $readers[$i].ReadLineAsync() }
				}
			}
			$now = $clock.Elapsed.TotalSeconds
			if ($measureSpeed -and ($now - $lastSample) -ge 1) {
				try {
					$current = [FfuDiskPerformance]::Read($request.disk.number)
					if ($previous) {
						$bytes = if ($request.mode -eq 'capture') { $current.BytesRead - $previous.BytesRead } else { $current.BytesWritten - $previous.BytesWritten }
						if ($bytes -lt 0) { throw 'Performance counters reset.' }
						Report ('FFU_SPEED:' + [UInt64]($bytes / ($now - $lastSample)))
					}
					$previous = $current
				} catch { $previous = $null; Report 'FFU_SPEED:unavailable' }
				$lastSample = $now
			}
			Start-Sleep -Milliseconds 20
		}
		$process.WaitForExit()
		$code = $process.ExitCode
	}
	finally {
		# Never leave DISM writing after cancellation or a logging/stream error.
		if (!$process.HasExited) {
			try {
				$killer = Start-Process -FilePath "$env:WINDIR\System32\taskkill.exe" -ArgumentList @('/PID', [string]$process.Id, '/T', '/F') -WindowStyle Hidden -Wait -PassThru
				$killer.Dispose()
			} finally {
				if (!$process.HasExited) { $process.Kill() }
				$process.WaitForExit()
			}
		}
		$process.Dispose()
	}
	Report "DISM exit code: $code"
	if ($code -ne 0) { throw "DISM exited with code $code. The result may be incomplete: see the log." }
}

function Capture-Image([string]$image, [string]$device, [string]$session) {
	$name = [IO.Path]::GetFileNameWithoutExtension($image)
	$working = Join-Path ([IO.Path]::GetDirectoryName($image)) ($name + '.' + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '.partial.ffu')
	try {
		Report 'FFU_STAGE:Capturing'
		Dism @('/English', '/Capture-FFU', "/ImageFile:$working", "/CaptureDrive:$device", "/Name:$name", '/Compress:default', "/LogPath:$session-dism.log")
		if (![IO.File]::Exists($working) -or (Get-Item -LiteralPath $working).Length -le 0) { throw 'DISM did not produce a valid FFU.' }
		Check-Output $image
		if ($request.overwrite) {
			# Windows PowerShell 5.1 converts a null string argument to an empty path.
			if (-not ('FfuFileReplace' -as [type])) {
				Add-Type 'public static class FfuFileReplace { public static void Replace(string source, string destination) { System.IO.File.Replace(source, destination, null); } }'
			}
			[FfuFileReplace]::Replace($working, $image)
		}
		else { [IO.File]::Move($working, $image) }
	}
	finally {
		# Dism waits for the process tree to exit before control reaches this block.
		# Delete ignores a missing file, but surfaces access errors or an unavailable volume.
		try { [IO.File]::Delete($working) }
		catch { throw "Could not delete the incomplete file: $working. $($_.Exception.Message)" }
	}
}

function Prepare-Disk($disk) {
	Check-Cancel
	if ($request.mode -eq 'capture') {
		# DISM must open volumes to read filesystem metadata before it locks them for capture.
		# Offlining the source prevents that discovery and produces ERROR_NOT_READY (21).
		if ($disk.offline) { Set-Disk -Number $disk.number -IsOffline $false }
		. (Join-Path $PSScriptRoot 'VolumeAccess.ps1')
		Get-Partition -DiskNumber $disk.number | Where-Object Type -ne 'Reserved' | ForEach-Object {
			Check-Cancel
			if ($_.IsOffline) { $_ | Set-Partition -IsOffline $false }
			foreach ($volume in @($_.AccessPaths | Where-Object { $_ -match '^\\\\\?\\Volume\{' })) { [FfuVolume]::Online($volume) }
		}
		return
	}
	if ($disk.offline -or $disk.volumesOffline) { return }
	if (!$disk.removable) { Set-Disk -Number $disk.number -IsOffline $true; return }
	# Windows cannot offline an entire removable disk. Offline every volume, including EFI.
	. (Join-Path $PSScriptRoot 'VolumeAccess.ps1')
	Get-Partition -DiskNumber $disk.number | Where-Object { $_.Type -ne 'Reserved' -and !$_.IsOffline } | ForEach-Object {
		Check-Cancel
		$paths = @($_.AccessPaths | Where-Object { $_ -match '^\\\\\?\\Volume\{' })
		if (!$paths.Count) { throw 'Cannot identify the volume: unable to take the disk offline.' }
		foreach ($volume in $paths) { [FfuVolume]::Offline($volume) }
	}
}

function Test-VolumesOffline([int]$number) {
	. (Join-Path $PSScriptRoot 'VolumeAccess.ps1')
	foreach ($partition in @(Get-Partition -DiskNumber $number | Where-Object Type -ne 'Reserved')) {
		if ($partition.IsOffline) { continue }
		$paths = @($partition.AccessPaths | Where-Object { $_ -match '^\\\\\?\\Volume\{' })
		if (!$paths.Count) { return $false }
		foreach ($volume in $paths) { if (![FfuVolume]::IsOffline($volume)) { return $false } }
	}
	return $true
}

function Save-DiskState($disk) {
	$state = [pscustomobject]@{ disk = $disk; partitions = @() }
	if ($disk.offline) { return $state }
	. (Join-Path $PSScriptRoot 'VolumeAccess.ps1')
	foreach ($partition in @(Get-Partition -DiskNumber $disk.number -ErrorAction SilentlyContinue | Where-Object Type -ne 'Reserved')) {
		$paths = @($partition.AccessPaths | Where-Object { $_ -match '^\\\\\?\\Volume\{' })
		$offline = [bool]$partition.IsOffline
		if (!$offline -and $paths.Count) { $offline = [FfuVolume]::IsOffline($paths[0]) }
		$state.partitions += [pscustomobject]@{ number = $partition.PartitionNumber; guid = [string]$partition.Guid; letter = [string]$partition.DriveLetter; offline = $offline }
	}
	return $state
}

function Restore-DiskState($state) {
	$current = Get-Disks | Where-Object number -eq $state.disk.number
	if (!$current -or (Identity $state.disk) -cne (Identity $current) -or $current.system -or $current.boot -or $current.paging) {
		throw 'Disk identity or protection changed; its original state could not be restored.'
	}
	if ($current.offline -ne $state.disk.offline) {
		Set-Disk -Number $current.number -IsOffline $state.disk.offline
	}
	if ($state.disk.offline) { return }
	. (Join-Path $PSScriptRoot 'VolumeAccess.ps1')
	foreach ($original in $state.partitions) {
		$partition = Get-Partition -DiskNumber $current.number -PartitionNumber $original.number -ErrorAction SilentlyContinue
		if (!$partition -or $partition.Type -eq 'Reserved') { continue }
		if ($partition.IsOffline -ne $original.offline) {
			$partition | Set-Partition -IsOffline $original.offline
			$partition = Get-Partition -DiskNumber $current.number -PartitionNumber $original.number
		}
		$paths = @($partition.AccessPaths | Where-Object { $_ -match '^\\\\\?\\Volume\{' })
		foreach ($volume in $paths) {
			if ($original.offline) { [FfuVolume]::Offline($volume) }
			else { [FfuVolume]::Online($volume) }
		}
	}
}

function Restore-DriveLetters($state) {
	if ($state.disk.offline) { return }
	$current = Get-Disks | Where-Object number -eq $state.disk.number
	if (!$current -or (Identity $state.disk) -cne (Identity $current) -or $current.system -or $current.boot -or $current.paging -or $current.offline) {
		throw 'Disk identity or protection changed; drive letters could not be restored.'
	}
	Update-Disk -Number $current.number
	foreach ($partition in @(Get-Partition -DiskNumber $current.number)) {
		if ($partition.Type -ne 'Basic' -or $partition.IsHidden -or $partition.IsOffline -or $partition.NoDefaultDriveLetter -or $partition.IsSystem -or $partition.IsBoot -or $partition.DriveLetter -match '^[A-Za-z]$') { continue }
		$volume = $partition | Get-Volume -ErrorAction SilentlyContinue
		if (!$volume -or $volume.FileSystem -notin @('NTFS', 'ReFS', 'exFAT', 'FAT32', 'FAT')) { continue }
		$original = @($state.partitions | Where-Object { $_.guid -and $_.guid -eq [string]$partition.Guid }) | Select-Object -First 1
		if ($original -and ($original.offline -or $original.letter -notmatch '^[A-Za-z]$')) { continue }
		if ($original -and !(Get-Partition -DriveLetter $original.letter -ErrorAction SilentlyContinue)) {
			$partition | Add-PartitionAccessPath -AccessPath ($original.letter + ':\')
		} else {
			$partition | Add-PartitionAccessPath -AssignDriveLetter
		}
	}
}

try {
	$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
	if ($Action -eq 'environment') { [pscustomobject]@{ admin = $admin } | ConvertTo-Json -Compress; exit 0 }
	if ($Action -eq 'list') { ConvertTo-Json -InputObject @(Get-Disks) -Depth 4 -Compress; exit 0 }
	if (!$admin) { throw 'Run FFU Cloner as administrator.' }
	if ($request.mode -notin @('apply', 'capture')) { throw 'Invalid operation.' }
	if ($request.confirmation -cne "DISK $($request.disk.number)") { throw 'Invalid disk confirmation.' }
	if ($request.disk.number -isnot [int] -or $request.disk.number -lt 0) { throw 'Invalid disk number.' }

	$mutex = [Threading.Mutex]::new($false, 'Global\FFUCloner.DISM')
	$acquired = $false
	$inputFile = $null
	try {
		try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
		if (!$acquired) { throw 'Another FFU Cloner process is already running.' }
		$image = Image-Path $request.image ($request.mode -eq 'apply')
		[IO.Directory]::CreateDirectory($request.logDirectory) | Out-Null
		$session = Join-Path $request.logDirectory ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
		$sessionLog = $session + '.txt'
		Report ('FFU_LOG:' + $sessionLog)
		Report "FFU Cloner $($request.version) | $($request.mode) | $(Identity $request.disk) | $image"
		foreach ($file in @($image, $sessionLog) + @($request.appPaths)) {
			if ((Path-Disk $file) -eq $request.disk.number) { throw 'The app, image, and logs must be on another disk.' }
		}
		if ($request.mode -eq 'apply') {
			# FileShare.Read prevents changes/deletion while inspecting and applying.
			$inputFile = [IO.File]::Open($image, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
			Report 'FFU_STAGE:Inspecting image'
			Dism @('/English', '/Get-ImageInfo', "/ImageFile:$image", "/LogPath:$session-inspect.log")
		}
		else {
			$volume = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($image))
			if ($volume.DriveFormat -notin @('NTFS', 'ReFS')) { throw 'Save the FFU on an NTFS or ReFS volume.' }
			if ($volume.AvailableFreeSpace -lt 2GB) { throw 'At least 2 GiB of free space is required to start capture.' }
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
			if ($request.mode -eq 'apply' -and $current -and !$current.offline) { $current.volumesOffline = Test-VolumesOffline $current.number }
			Check-Disk $request.disk $current ($request.mode -eq 'apply')
			if ($request.mode -eq 'capture' -and $current.offline) { throw 'Capture requires an online source disk.' }
			$image = Image-Path $image ($request.mode -eq 'apply')
			$device = '\\.\PhysicalDrive' + $current.number
			if ($request.mode -eq 'capture') {
				Capture-Image $image $device $session
			}
			else {
				Report 'FFU_STAGE:Restoring'
				Dism @('/English', '/Apply-FFU', "/ImageFile:$image", "/ApplyDrive:$device", "/LogPath:$session-dism.log")
			}
		}
		catch {
			try { Report ('Operation error: ' + $_.Exception.Message) } catch { }
			throw
		}
		finally {
			try {
				Restore-DiskState $originalState
				Report 'Original disk state restored.'
			} catch { throw "Could not restore the original disk state: $($_.Exception.Message)" }
		}
		if ($request.mode -eq 'apply') { Restore-DriveLetters $originalState }
		Report ('FFU_RESULT:' + (@{ success = $true; image = $image; logPath = $sessionLog } | ConvertTo-Json -Compress))
	}
	finally {
		if ($inputFile) { $inputFile.Dispose() }
		if ($acquired) { $mutex.ReleaseMutex() }
		if ($mutex) { $mutex.Dispose() }
	}
}
catch {
	if ($_.Exception -is [OperationCanceledException]) { Report 'FFU_CANCELLED' }
	$message = $_.Exception.Message
	[Console]::Out.WriteLine('FFU_ERROR:' + $message)
	if ($sessionLog) { try { Report ('ERROR: ' + $message) } catch { } }
	exit 1
}
