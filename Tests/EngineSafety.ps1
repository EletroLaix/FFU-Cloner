# Load only pure safety functions from the actual engine; do not execute its entry point.
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot '../Source/Application/Windows/Engine.ps1'
. (Join-Path $PSScriptRoot 'EngineFunctions.ps1')
$ast = Get-EngineSyntax
$storageTokens = $null; $storageErrors = $null
[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../Scripts/HardwareStorage.ps1'), [ref]$storageTokens, [ref]$storageErrors) | Out-Null
if ($storageErrors.Count) { throw ($storageErrors | Out-String) }
$applicationDirectory = Split-Path $script
$functions = $ast | ForEach-Object { $_.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in @('Identity','Check-Disk','Check-Cancel','Prepare-Disk','Test-VolumesOffline') }, $true) }
foreach ($function in $functions) { . ([ScriptBlock]::Create($function.Extent.Text.Replace('$PSScriptRoot','$applicationDirectory'))) }
$request = [pscustomobject]@{ mode = 'apply' }
$expected = [pscustomobject]@{ number=1; uniqueId='TEST'; serial='SERIAL'; size=[UInt64]32017047552; name='Test USB'; bus='USB'; removable=$true; system=$false; boot=$false; paging=$false; offline=$true; volumesOffline=$false; readOnly=$false; style='GPT' }
$passed = 0
function Reject([string]$property, $value) {
	$current = $expected.PSObject.Copy()
	$current.$property = $value
	$rejected = $false
	try { Check-Disk $expected $current $true } catch { $rejected = $true }
	if (!$rejected) { throw "Unsafe disk accepted: $property" }
	$script:passed++
}
Check-Disk $expected $expected $true
Reject 'uniqueId' 'SWAPPED'
Reject 'serial' 'OTHER'
Reject 'size' ([UInt64]32017048064)
Reject 'number' 2
Reject 'system' $true
Reject 'boot' $true
Reject 'paging' $true
Reject 'readOnly' $true
Reject 'offline' $false
$offlineVolume = $expected.PSObject.Copy()
$offlineVolume.offline=$false; $offlineVolume.volumesOffline=$true
Check-Disk $expected $offlineVolume $true
$passed++
$request.mode='capture'
Reject 'style' 'MBR'
$readOnly = $expected.PSObject.Copy(); $readOnly.readOnly=$true
Check-Disk $expected $readOnly $true
$passed++
# Regression: Storage reports the EFI online even after the native volume is offline.
# Replace only the OS calls; exercise the production preparation and verification functions.
Add-Type 'public static class FfuVolume { public static bool OfflineState = false; public static int Calls = 0; public static int OnlineCalls = 0; public static bool IsOffline(string path) { return OfflineState; } public static void Offline(string path) { Calls++; OfflineState = true; } public static void Online(string path) { OnlineCalls++; OfflineState = false; } }'
$script:fixture = @(
	[pscustomobject]@{ PartitionNumber=1; Type='System'; IsOffline=$false; AccessPaths=@('\\?\Volume{11111111-1111-1111-1111-111111111111}\') },
	[pscustomobject]@{ PartitionNumber=2; Type='Reserved'; IsOffline=$false; AccessPaths=@() },
	[pscustomobject]@{ PartitionNumber=3; Type='Basic'; IsOffline=$true; AccessPaths=@('\\?\Volume{33333333-3333-3333-3333-333333333333}\') }
)
function Get-Partition { param($DiskNumber) if ($DiskNumber -ne 1) { throw 'Wrong disk' }; $script:fixture }
if (Test-VolumesOffline 1) { throw 'Online EFI accepted' }
$candidate = $expected.PSObject.Copy(); $candidate.offline=$false; $candidate.volumesOffline=$false
$request.mode='apply'
Prepare-Disk $candidate
if ([FfuVolume]::Calls -ne 1 -or !(Test-VolumesOffline 1)) { throw 'EFI preparation failed' }
$passed += 2
# Capture must reverse offline preparation so DISM can discover filesystem metadata.
$request.mode='capture'
$script:onlineDiskCalls = 0; $script:onlinePartitionCalls = 0
function Set-Disk { param($Number, $IsOffline) if ($Number -ne 1 -or $IsOffline) { throw 'Invalid capture preparation' }; $script:onlineDiskCalls++ }
function Set-Partition { param([Parameter(ValueFromPipeline)]$Partition, $IsOffline) process { if ($IsOffline) { throw 'Capture volume offlined' }; $script:onlinePartitionCalls++ } }
$candidate.offline=$true
Prepare-Disk $candidate
if ($script:onlineDiskCalls -ne 1 -or $script:onlinePartitionCalls -ne 1 -or [FfuVolume]::OnlineCalls -ne 2 -or [FfuVolume]::OfflineState) { throw 'Capture did not online source volumes' }
$passed++
$script:fixture[0].AccessPaths=@()
if (Test-VolumesOffline 1) { throw 'Unidentified volume accepted' }
$passed++
Write-Output "$passed PowerShell safety checks passed. No disk read or modified."
