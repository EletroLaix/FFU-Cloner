param([ValidateSet('prepare', 'clear', 'online', 'offline')][string]$Action, [int]$Number, [string]$UniqueId, [string]$Serial, [UInt64]$Size, [string]$OutputPath, [string]$AppPath)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
	$d = Get-Disk -Number $Number
	if ($d.UniqueId -cne $UniqueId -or ([string]$d.SerialNumber).Trim() -cne $Serial -or $d.Size -ne $Size -or $d.BusType -ne 'USB' -or $d.IsBoot -or $d.IsSystem -or $d.IsReadOnly) { throw 'Disk identity changed or disk is protected' }
	$paging = @(Get-CimInstance Win32_PageFileUsage | ForEach-Object { $_.Name.Substring(0, 1) })
	if (@(Get-Partition -DiskNumber $Number | Where-Object { $_.DriveLetter -and $paging -contains [string]$_.DriveLetter }).Count) { throw 'Paging disk is protected' }
	foreach ($protected in @($PSScriptRoot, $OutputPath, $AppPath)) {
		if (!$protected -or $protected -notmatch '^[A-Za-z]:\\') { throw 'Protected path cannot be identified' }
		$probe = [IO.Path]::GetFullPath($protected)
		while ($probe) {
			if (([IO.File]::GetAttributes($probe) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked test paths are not supported' }
			$probe = [IO.Path]::GetDirectoryName($probe)
		}
		$parts = @(Get-Partition -DriveLetter $protected.Substring(0,1))
		if ($parts.Count -ne 1 -or $parts[0].DiskNumber -eq $Number) { throw 'Test code, runtime and output must be on another disk' }
	}
	if ($Action -eq 'prepare') {
		Set-Disk -Number $Number -IsOffline $false
		Clear-Disk -Number $Number -RemoveData -RemoveOEM -Confirm:$false
		if ((Get-Disk -Number $Number).PartitionStyle -eq 'RAW') { Initialize-Disk -Number $Number -PartitionStyle GPT | Out-Null }
		# Keep the fixture small even when the sacrificial disk has terabytes of capacity.
		$p = New-Partition -DiskNumber $Number -Size 512MB -AssignDriveLetter
		$p | Format-Volume -FileSystem NTFS -NewFileSystemLabel 'FFU_TEST' -Confirm:$false | Out-Null
	}
	elseif ($Action -eq 'offline') {
		Set-Disk -Number $Number -IsOffline $true
		exit 0
	}
	elseif ($Action -eq 'clear') {
		Set-Disk -Number $Number -IsOffline $false
		Clear-Disk -Number $Number -RemoveData -RemoveOEM -Confirm:$false
		exit 0
	}
	else {
		Set-Disk -Number $Number -IsOffline $false
		Update-Disk -Number $Number
		Get-Partition -DiskNumber $Number | Where-Object { $_.Type -ne 'Reserved' } | Set-Partition -IsOffline $false
		$p = Get-Partition -DiskNumber $Number | Where-Object Type -eq 'Basic'
		if (@($p).Count -ne 1) { throw 'Unexpected data partition count' }
		if (!$p.DriveLetter) { $p | Add-PartitionAccessPath -AssignDriveLetter; $p = Get-Partition -DiskNumber $Number -PartitionNumber $p.PartitionNumber }
	}
	[pscustomobject]@{
		letter = [string]$p.DriveLetter
		layout = @(Get-Partition -DiskNumber $Number | Select-Object PartitionNumber, Offset, Size, GptType)
	} | ConvertTo-Json -Depth 4 -Compress
}
catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
