$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$listeners = @()
try {
	# Do not attach to a stale or unrelated debugging session.
	foreach ($port in @(9229, 9223)) {
		$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
		$listener.Start()
		$listeners += $listener
	}
} catch {
	throw 'Debug port 9229 or 9223 is already in use. Close the other debug session and retry.'
} finally {
	foreach ($listener in $listeners) { $listener.Stop() }
}
$env:ELECTRON_RUN_AS_NODE = $null
$arguments = @('--inspect-brk=127.0.0.1:9229', ('"' + $root + '"'), '--remote-debugging-port=9223', '--remote-debugging-address=127.0.0.1')
Start-Process -FilePath $electron -ArgumentList $arguments -WorkingDirectory $root -Verb RunAs -WindowStyle Normal | Out-Null
