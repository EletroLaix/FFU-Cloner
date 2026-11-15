# Collect disk identity, protection flags, and volume access paths for validation.
function Get-Disks {
	$paging = @(Get-CimInstance Win32_PageFileUsage | ForEach-Object {
		$_.Name.Substring(0, 2)
	})
	$partitions = @(Get-Partition)
	$devices = @(Get-CimInstance Win32_DiskDrive)
	@(Get-Disk | ForEach-Object {
		$disk = $_
		$diskPartitions = @($partitions | Where-Object DiskNumber -eq $disk.Number)
		$media = $devices | Where-Object Index -eq $disk.Number
		$pagingPartitions = @($diskPartitions | Where-Object {
			$_.DriveLetter -and ($paging -contains ([string]$_.DriveLetter + ':'))
		})
		$onlinePartitions = @($diskPartitions | Where-Object {
			$_.Type -ne 'Reserved' -and !$_.IsOffline
		})

		[pscustomobject]@{
			number = [int]$disk.Number
			name = [string]$disk.FriendlyName
			serial = ([string]$disk.SerialNumber).Trim()
			uniqueId = [string]$disk.UniqueId
			size = [UInt64]$disk.Size
			bus = [string]$disk.BusType
			style = [string]$disk.PartitionStyle
			system = [bool]$disk.IsSystem
			boot = [bool]$disk.IsBoot
			offline = [bool]$disk.IsOffline
			readOnly = [bool]$disk.IsReadOnly
			removable = [bool]($media.Capabilities -contains 7)
			paging = [bool]($pagingPartitions.Count -gt 0)
			volumesOffline = [bool]($onlinePartitions.Count -eq 0)
			accessPaths = [string[]]@($diskPartitions | ForEach-Object {
				$_.AccessPaths
			})
		}
	})
}

# Build a stable identity for comparison before changing or restoring a disk.
function Identity($disk) {
	"$($disk.number)|$($disk.uniqueId)|$($disk.serial)|$($disk.size)|$($disk.name)|$($disk.bus)|$($disk.removable)"
}

# Reject a changed, protected, or unsuitable disk immediately before use.
function Check-Disk($expected, $current, [bool]$requireOffline = $false) {
	if (!$current -or (Identity $expected) -cne (Identity $current)) {
		throw 'The disk has changed or was disconnected. Refresh the selection.'
	}
	if ($current.system -or $current.boot -or $current.paging) {
		throw 'System, boot, or paging disk: operation blocked.'
	}
	if ([string]::IsNullOrWhiteSpace([string]$current.uniqueId) -or $current.size -le 0) {
		throw 'Disk identity unavailable.'
	}
	if ($request.mode -eq 'apply' -and $current.readOnly) {
		throw 'Disk is read-only.'
	}
	if ($request.mode -eq 'capture' -and $current.style -ne 'GPT') {
		throw 'FFU capture requires a GPT disk.'
	}
	if ($requireOffline -and !$current.offline -and !$current.volumesOffline) {
		throw 'Disk or volumes are not offline: DISM will not start.'
	}
}
