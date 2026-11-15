# Validate the local FFU path and reject links or redirected parent directories.
function Image-Path([string]$value, [bool]$mustExist) {
	if ($value -notmatch '^[a-zA-Z]:\\' -or $value.Substring(2).Contains(':')) {
		throw 'Use an FFU file on a local volume with a drive letter.'
	}
	$full = [IO.Path]::GetFullPath($value)
	if ([IO.Path]::GetExtension($full) -ine '.ffu') {
		throw 'The file must have the .ffu extension.'
	}
	if ($mustExist -and ![IO.File]::Exists($full)) {
		throw 'Image not found.'
	}
	if (!$mustExist) {
		Check-Output $full
	}
	$directory = [IO.Path]::GetDirectoryName($full)
	if (![IO.Directory]::Exists($directory)) {
		throw 'The destination directory does not exist.'
	}
	$item = if ($mustExist) {
		$full
	}
	else {
		$directory
	}
	while ($item) {
		if (([IO.File]::GetAttributes($item) -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
			throw 'Links, junctions, and mount points are not supported for the FFU file.'
		}
		$item = [IO.Path]::GetDirectoryName($item)
	}
	return $full
}

# Allow replacement only while the confirmed destination file remains unchanged.
function Check-Output([string]$image) {
	$exists = [IO.File]::Exists($image)
	if (!$request.overwrite) {
		if (Test-Path -LiteralPath $image) {
			throw 'The file already exists. Choose a new name.'
		}
		return
	}
	if (!$exists) {
		throw 'The selected image has changed. Select it again.'
	}
	$file = Get-Item -LiteralPath $image -Force
	if ($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
	$file.Length -ne $request.overwrite.size -or
	([DateTimeOffset]$file.LastWriteTimeUtc).ToUnixTimeMilliseconds() -ne $request.overwrite.modified) {
		throw 'The selected image has changed. Select it again.'
	}
}

# Resolve a local path to its physical disk so application files remain protected.
function Path-Disk([string]$value) {
	if ($value -notmatch '^[a-zA-Z]:\\') {
		throw 'Cannot identify the local path.'
	}
	$probe = [IO.Path]::GetFullPath($value)
	if (!(Test-Path -LiteralPath $probe)) {
		$probe = [IO.Path]::GetDirectoryName($probe)
	}
	while ($probe) {
		if (([IO.File]::GetAttributes($probe) -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
			throw 'The app, image, and logs must use paths without links or mount points.'
		}
		$probe = [IO.Path]::GetDirectoryName($probe)
	}
	$part = @(Get-Partition -DriveLetter $value.Substring(0, 1))
	if ($part.Count -ne 1) {
		throw 'Cannot identify the volume.'
	}
	[int]$part[0].DiskNumber
}
