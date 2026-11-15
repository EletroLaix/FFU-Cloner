# Write the same operation message to the session log and the parent process.
function Report([string]$text) {
	if ($sessionLog) {
		[IO.File]::AppendAllText($sessionLog, "$(Get-Date -Format o) $text`r`n", [Text.UTF8Encoding]::new($false))
	}
	[Console]::Out.WriteLine($text)
}

# Stop cooperatively when the parent process creates the cancellation marker.
function Check-Cancel {
	if ($request.cancelFile -and [IO.File]::Exists($request.cancelFile)) {
		throw [OperationCanceledException]::new('Operation cancelled.')
	}
}
