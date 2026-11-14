param([string]$Directory)
$ErrorActionPreference='Stop'
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../Source/Application/Windows/Engine.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$functions=$ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in @('Capture-Image','Check-Output')},$true)
foreach ($function in $functions) { . ([ScriptBlock]::Create($function.Extent.Text)) }
$request=[pscustomobject]@{ overwrite=$null }
function Report([string]$text) { }
function Dism([string[]]$arguments) {
	$script:partial = ($arguments | Where-Object { $_.StartsWith('/ImageFile:') }).Substring(11)
	[IO.File]::WriteAllText($script:partial,'TEST IMAGE')
	if ($script:scenario -eq 'cancel') { throw [OperationCanceledException]::new('Cancelled') }
	if ($script:scenario -eq 'error') { throw 'DISM failed' }
	if ($script:scenario -eq 'locked') {
		$script:lock=[IO.File]::Open($script:partial,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
		throw [OperationCanceledException]::new('Cancelled')
	}
	if ($script:scenario -eq 'missing') {
		[IO.File]::Delete($script:partial)
		[IO.Directory]::Delete([IO.Path]::GetDirectoryName($script:partial))
		throw [OperationCanceledException]::new('Cancelled')
	}
}
$original=Join-Path $Directory 'Original.ffu'
[IO.File]::WriteAllText($original,'KEEP THIS IMAGE')
foreach ($script:scenario in @('success','cancel','error','locked','missing')) {
	$image=Join-Path $Directory ($script:scenario + '.ffu')
	if ($script:scenario -eq 'missing') {
		$child=Join-Path $Directory 'DisappearingVolume'
		[IO.Directory]::CreateDirectory($child) | Out-Null
		$image=Join-Path $child 'Image.ffu'
	}
	$message=$null
	try { Capture-Image $image '\\.\PhysicalDrive1' (Join-Path $Directory 'Session') }
	catch { $message=$_.Exception.Message }
	try {
		if ($script:scenario -eq 'success') {
			if ($message -or [IO.File]::ReadAllText($image) -ne 'TEST IMAGE') { throw 'Successful image lost' }
		} else {
			if (!$message -or [IO.File]::Exists($image)) { throw 'Invalid final image left behind' }
		}
		if ($script:scenario -eq 'locked') {
			if ($message -notlike '*Could not delete*' -or ![IO.File]::Exists($script:partial)) { throw 'Cleanup failure hidden' }
		} elseif ($script:scenario -eq 'missing') {
			if ($message -notlike '*Could not delete*') { throw 'Missing directory silently treated as cleaned' }
		} elseif ([IO.File]::Exists($script:partial)) { throw 'Partial image left behind' }
		if ([IO.File]::ReadAllText($original) -ne 'KEEP THIS IMAGE') { throw 'Original FFU changed' }
	} finally {
		if ($script:lock) { $script:lock.Dispose(); $script:lock=$null }
	}
}
$overwrite=Join-Path $Directory 'Replace.ffu'
foreach ($script:scenario in @('cancel','error','success')) {
	[IO.File]::WriteAllText($overwrite,'ORIGINAL')
	$file=Get-Item -LiteralPath $overwrite
	$request.overwrite=[pscustomobject]@{ size=$file.Length; modified=([DateTimeOffset]$file.LastWriteTimeUtc).ToUnixTimeMilliseconds() }
	$message=$null
	try { Capture-Image $overwrite '\\.\PhysicalDrive1' (Join-Path $Directory 'Session') } catch { $message=$_.Exception.Message }
	$expected=if ($script:scenario -eq 'success') { 'TEST IMAGE' } else { 'ORIGINAL' }
	if ([IO.File]::ReadAllText($overwrite) -ne $expected) { throw "Replacement $script:scenario damaged the original or lost the new image: $message" }
	if ($script:scenario -eq 'success' -and $message) { throw $message }
	if ($script:scenario -ne 'success' -and !$message) { throw 'Expected capture failure' }
}
$file=Get-Item -LiteralPath $overwrite
$request.overwrite=[pscustomobject]@{ size=$file.Length+1; modified=([DateTimeOffset]$file.LastWriteTimeUtc).ToUnixTimeMilliseconds() }
try { Check-Output $overwrite; throw 'Changed image accepted' } catch { if ($_.Exception.Message -eq 'Changed image accepted') { throw } }
Write-Output '9 capture cleanup checks passed. No physical disk accessed.'
