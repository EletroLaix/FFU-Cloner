# Run DISM, stream its output, sample throughput, and wait for cleanup on every exit.
function Dism([string[]]$arguments) {
	Check-Cancel
	$measureSpeed = $arguments -contains '/Capture-FFU' -or $arguments -contains '/Apply-FFU'
	$previous = $null
	if ($measureSpeed) {
		try {
			. (Join-Path $PSScriptRoot 'DiskPerformance.ps1')
			$previous = [FfuDiskPerformance]::Read($request.disk.number)
		}
		catch {
			Report 'FFU_SPEED:unavailable'
		}
	}
	$clock = [Diagnostics.Stopwatch]::StartNew()
	$lastSample = $clock.Elapsed.TotalSeconds
	$quotedArguments = $arguments | ForEach-Object {
		'"' + $_ + '"'
	}
	Report ('DISM ' + ($quotedArguments -join ' '))

	$info = [Diagnostics.ProcessStartInfo]::new()
	$info.FileName = "$env:WINDIR\System32\dism.exe"
	$info.Arguments = ($arguments | ForEach-Object {
		'"' + $_ + '"'
	}) -join ' '
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
					if ($null -eq $line) {
						$pending[$i] = $null
					}
					else {
						Report $line
						$pending[$i] = $readers[$i].ReadLineAsync()
					}
				}
			}
			$now = $clock.Elapsed.TotalSeconds
			if ($measureSpeed -and ($now - $lastSample) -ge 1) {
				try {
					$current = [FfuDiskPerformance]::Read($request.disk.number)
					if ($previous) {
						$bytes = if ($request.mode -eq 'capture') {
							$current.BytesRead - $previous.BytesRead
						}
						else {
							$current.BytesWritten - $previous.BytesWritten
						}
						if ($bytes -lt 0) {
							throw 'Performance counters reset.'
						}
						Report ('FFU_SPEED:' + [UInt64]($bytes / ($now - $lastSample)))
					}
					$previous = $current
				}
				catch {
					$previous = $null
					Report 'FFU_SPEED:unavailable'
				}
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
				$killOptions = @{
					FilePath = "$env:WINDIR\System32\taskkill.exe"
					ArgumentList = @('/PID', [string]$process.Id, '/T', '/F')
					WindowStyle = 'Hidden'
					Wait = $true
					PassThru = $true
				}
				$killer = Start-Process @killOptions
				$killer.Dispose()
			}
			finally {
				if (!$process.HasExited) {
					$process.Kill()
				}
				$process.WaitForExit()
			}
		}
		$process.Dispose()
	}
	Report "DISM exit code: $code"
	if ($code -ne 0) {
		throw "DISM exited with code $code. The result may be incomplete: see the log."
	}
}
