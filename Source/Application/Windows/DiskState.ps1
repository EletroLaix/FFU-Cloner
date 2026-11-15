# Bring capture volumes online or isolate restore volumes before DISM starts.
function Prepare-Disk($disk) {
	Check-Cancel
	if ($request.mode -eq 'capture') {
		# DISM must open volumes to read filesystem metadata before it locks them for capture.
		# Offlining the source prevents that discovery and produces ERROR_NOT_READY (21).
		if ($disk.offline) {
			Set-Disk -Number $disk.number -IsOffline $false
		}
		. (Join-Path $PSScriptRoot 'VolumeAccess.ps1')
		Get-Partition -DiskNumber $disk.number | Where-Object Type -ne 'Reserved' | ForEach-Object {
			Check-Cancel
			if ($_.IsOffline) {
				$_ | Set-Partition -IsOffline $false
			}
			foreach ($volume in @($_.AccessPaths | Where-Object {
				$_ -match '^\\\\\?\\Volume\{'
			})) {
				[FfuVolume]::Online($volume)
			}
		}
		return
	}
	if ($disk.offline -or $disk.volumesOffline) {
		return
	}
	if (!$disk.removable) {
		Set-Disk -Number $disk.number -IsOffline $true
		return
	}
	# Windows cannot offline an entire removable disk. Offline every volume, including EFI.
	. (Join-Path $PSScriptRoot 'VolumeAccess.ps1')
	Get-Partition -DiskNumber $disk.number | Where-Object {
		$_.Type -ne 'Reserved' -and !$_.IsOffline
	} | ForEach-Object {
		Check-Cancel
		$paths = @($_.AccessPaths | Where-Object {
			$_ -match '^\\\\\?\\Volume\{'
		})
		if (!$paths.Count) {
			throw 'Cannot identify the volume: unable to take the disk offline.'
		}
		foreach ($volume in $paths) {
			[FfuVolume]::Offline($volume)
		}
	}
}

# Verify native volume state when Storage cmdlets cannot report isolation reliably.
function Test-VolumesOffline([int]$number) {
	. (Join-Path $PSScriptRoot 'VolumeAccess.ps1')
	foreach ($partition in @(Get-Partition -DiskNumber $number | Where-Object Type -ne 'Reserved')) {
		if ($partition.IsOffline) {
			continue
		}
		$paths = @($partition.AccessPaths | Where-Object {
			$_ -match '^\\\\\?\\Volume\{'
		})
		if (!$paths.Count) {
			return $false
		}
		foreach ($volume in $paths) {
			if (![FfuVolume]::IsOffline($volume)) {
				return $false
			}
		}
	}
	return $true
}

# Remember disk and partition state before preparing the selected device.
function Save-DiskState($disk) {
	$state = [pscustomobject]@{
		disk = $disk
		partitions = @()
	}
	if ($disk.offline) {
		return $state
	}
	. (Join-Path $PSScriptRoot 'VolumeAccess.ps1')
	foreach ($partition in @(Get-Partition -DiskNumber $disk.number -ErrorAction SilentlyContinue | Where-Object Type -ne 'Reserved')) {
		$paths = @($partition.AccessPaths | Where-Object {
			$_ -match '^\\\\\?\\Volume\{'
		})
		$offline = [bool]$partition.IsOffline
		if (!$offline -and $paths.Count) {
			$offline = [FfuVolume]::IsOffline($paths[0])
		}
		$state.partitions += [pscustomobject]@{
			number = $partition.PartitionNumber
			guid = [string]$partition.Guid
			letter = [string]$partition.DriveLetter
			offline = $offline
		}
	}
	return $state
}

# Recheck disk identity before restoring the recorded online and offline states.
function Restore-DiskState($state) {
	$current = Get-Disks | Where-Object number -eq $state.disk.number
	if (
		!$current -or
		(Identity $state.disk) -cne (Identity $current) -or
		$current.system -or
		$current.boot -or
		$current.paging
	) {
		throw 'Disk identity or protection changed; its original state could not be restored.'
	}
	if ($current.offline -ne $state.disk.offline) {
		Set-Disk -Number $current.number -IsOffline $state.disk.offline
	}
	if ($state.disk.offline) {
		return
	}
	. (Join-Path $PSScriptRoot 'VolumeAccess.ps1')
	foreach ($original in $state.partitions) {
		$partition = Get-Partition -DiskNumber $current.number -PartitionNumber $original.number -ErrorAction SilentlyContinue
		if (!$partition -or $partition.Type -eq 'Reserved') {
			continue
		}
		if ($partition.IsOffline -ne $original.offline) {
			$partition | Set-Partition -IsOffline $original.offline
			$partition = Get-Partition -DiskNumber $current.number -PartitionNumber $original.number
		}
		$paths = @($partition.AccessPaths | Where-Object {
			$_ -match '^\\\\\?\\Volume\{'
		})
		foreach ($volume in $paths) {
			if ($original.offline) {
				[FfuVolume]::Offline($volume)
			}
			else {
				[FfuVolume]::Online($volume)
			}
		}
	}
}

# Restore access to eligible data volumes without exposing hidden partitions.
function Restore-DriveLetters($state) {
	if ($state.disk.offline) {
		return
	}
	$current = Get-Disks | Where-Object number -eq $state.disk.number
	if (
		!$current -or
		(Identity $state.disk) -cne (Identity $current) -or
		$current.system -or
		$current.boot -or
		$current.paging -or
		$current.offline
	) {
		throw 'Disk identity or protection changed; drive letters could not be restored.'
	}
	Update-Disk -Number $current.number
	foreach ($partition in @(Get-Partition -DiskNumber $current.number)) {
		if (
			$partition.Type -ne 'Basic' -or
			$partition.IsHidden -or
			$partition.IsOffline -or
			$partition.NoDefaultDriveLetter -or
			$partition.IsSystem -or
			$partition.IsBoot -or
			$partition.DriveLetter -match '^[A-Za-z]$'
		) {
			continue
		}
		$volume = $partition | Get-Volume -ErrorAction SilentlyContinue
		if (!$volume -or $volume.FileSystem -notin @('NTFS', 'ReFS', 'exFAT', 'FAT32', 'FAT')) {
			continue
		}
		$original = @($state.partitions | Where-Object {
			$_.guid -and $_.guid -eq [string]$partition.Guid
		}) | Select-Object -First 1
		if ($original -and ($original.offline -or $original.letter -notmatch '^[A-Za-z]$')) {
			continue
		}
		if ($original -and !(Get-Partition -DriveLetter $original.letter -ErrorAction SilentlyContinue)) {
			$partition | Add-PartitionAccessPath -AccessPath ($original.letter + ':\')
		}
		else {
			$partition | Add-PartitionAccessPath -AssignDriveLetter
		}
	}
}
