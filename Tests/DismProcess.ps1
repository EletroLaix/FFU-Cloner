param([string]$CancelFile, [ValidateSet('success','failure','cancel','stream-error','speed-capture','speed-apply')][string]$Scenario)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../Source/Application/Windows/Engine.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$request = [pscustomobject]@{ cancelFile = $CancelFile; mode='apply'; disk=@{ number=1 } }
if ($Scenario -like 'speed-*') {
	$request.mode = $Scenario.Substring(6)
	Add-Type 'public struct FfuTestCounters { public long BytesRead, BytesWritten; } public static class FfuDiskPerformance { static int calls; public static FfuTestCounters Read(int number) { calls++; return new FfuTestCounters { BytesRead = calls * 1000000L, BytesWritten = calls * 2000000L }; } }'
}
$applicationDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../Source/Application/Windows'))
function Report([string]$text) {
	if ($Scenario -eq 'stream-error' -and $text.Trim() -eq 'FFU_TEST_READY') { throw [IO.IOException]::new('Simulated log failure') }
	[Console]::Out.WriteLine($text)
}
# Exercise the production stream/cancellation loop with harmless cmd/ping processes instead of DISM.
$functions = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in @('Check-Cancel','Dism') }, $true)
foreach ($function in $functions) {
	$source = $function.Extent.Text.Replace('$info.FileName = "$env:WINDIR\System32\dism.exe"', '$info.FileName = $env:ComSpec')
	$source = $source.Replace('$info.Arguments = ($arguments | ForEach-Object { ''"'' + $_ + ''"'' }) -join '' ''', '$info.Arguments = $script:testArguments')
	$source = $source.Replace('$PSScriptRoot','$applicationDirectory')
	. ([ScriptBlock]::Create($source))
}
$script:testArguments = switch ($Scenario) {
	'success' { '/d /c "echo 42.5% & echo 100% & exit /b 0"' }
	'failure' { '/d /c "echo Failed 1>&2 & exit /b 7"' }
	'cancel' { '/d /c "echo FFU_TEST_READY & ping -n 60 127.0.0.1 >nul"' }
	'stream-error' { '/d /c "echo FFU_TEST_READY & ping -n 60 127.0.0.1 >nul"' }
	'speed-capture' { '/d /c "ping -n 4 127.0.0.1 >nul & echo 100%"' }
	'speed-apply' { '/d /c "ping -n 4 127.0.0.1 >nul & echo 100%"' }
}
try {
	$command = if ($Scenario -eq 'speed-capture') { '/Capture-FFU' } elseif ($Scenario -eq 'speed-apply') { '/Apply-FFU' } else { '/test' }
	Dism @($command)
	Report 'TEST_SUCCESS'
}
catch {
	if ($_.Exception -is [OperationCanceledException]) { Report 'FFU_CANCELLED'; exit 2 }
	[Console]::Error.WriteLine($_.Exception.Message); exit 1
}
