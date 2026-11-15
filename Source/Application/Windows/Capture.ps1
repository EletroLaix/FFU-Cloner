# Capture into a temporary image and publish it only after successful completion.
function Capture-Image([string]$image, [string]$device, [string]$session) {
	$name = [IO.Path]::GetFileNameWithoutExtension($image)
	$workingName = $name + '.' + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '.partial.ffu'
	$working = Join-Path ([IO.Path]::GetDirectoryName($image)) $workingName

	try {
		Report 'FFU_STAGE:Capturing'
		Dism @(
			'/English',
			'/Capture-FFU',
			"/ImageFile:$working",
			"/CaptureDrive:$device",
			"/Name:$name",
			'/Compress:default',
			"/LogPath:$session-dism.log"
		)
		if (![IO.File]::Exists($working) -or (Get-Item -LiteralPath $working).Length -le 0) {
			throw 'DISM did not produce a valid FFU.'
		}
		Check-Output $image
		if ($request.overwrite) {
			# Windows PowerShell 5.1 converts a null string argument to an empty path.
			if (-not ('FfuFileReplace' -as [type])) {
				Add-Type @'
public static class FfuFileReplace {
	// Preserve a null backup path when called from Windows PowerShell 5.1.
	public static void Replace(string source, string destination) {
		System.IO.File.Replace(source, destination, null);
	}
}
'@
			}
			[FfuFileReplace]::Replace($working, $image)
		}
		else {
			[IO.File]::Move($working, $image)
		}
	}
	finally {
		# Dism waits for the process tree to exit before control reaches this block.
		# Delete ignores a missing file, but surfaces access errors or an unavailable volume.
		try {
			[IO.File]::Delete($working)
		}
		catch {
			throw "Could not delete the incomplete file: $working. $($_.Exception.Message)"
		}
	}
}
