$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '../Source/Application/Windows/Engine.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$applicationDirectory = Split-Path $source
$functions = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in @('Identity','Save-DiskState','Restore-DiskState') }, $true)
foreach ($function in $functions) { . ([ScriptBlock]::Create($function.Extent.Text.Replace('$PSScriptRoot','$applicationDirectory'))) }
Add-Type 'public static class FfuVolume { public static bool IsOffline(string path) { return false; } public static void Offline(string path) { } public static void Online(string path) { } }'
$script:disk = [pscustomobject]@{ number=1; uniqueId='USB'; serial='123'; size=[UInt64]32000000000; name='Test'; bus='USB'; removable=$false; offline=$false; system=$false; boot=$false; paging=$false }
$script:partitions = @(
 [pscustomobject]@{ PartitionNumber=1; Type='Basic'; IsOffline=$false; AccessPaths=@() },
 [pscustomobject]@{ PartitionNumber=2; Type='Basic'; IsOffline=$true; AccessPaths=@() }
)
function Get-Disks { $script:disk }
function Get-Partition { [CmdletBinding()] param($DiskNumber, $PartitionNumber) if ($DiskNumber -ne 1) { throw 'Wrong disk' }; if ($PartitionNumber) { $script:partitions | Where-Object PartitionNumber -eq $PartitionNumber } else { $script:partitions } }
function Set-Disk { param($Number, [bool]$IsOffline) if ($Number -ne 1) { throw 'Wrong disk' }; $script:disk.offline=$IsOffline }
function Set-Partition { [CmdletBinding()] param([Parameter(ValueFromPipeline)]$Partition, [bool]$IsOffline) process { $Partition.IsOffline=$IsOffline } }
$saved = Save-DiskState $script:disk.PSObject.Copy()
$script:disk.offline=$true
$script:partitions[0].IsOffline=$true
$script:partitions[1].IsOffline=$false
Restore-DiskState $saved
if ($script:disk.offline -or $script:partitions[0].IsOffline -or !$script:partitions[1].IsOffline) { throw 'Online disk or partition state not restored' }
$script:disk.offline=$true
$saved = Save-DiskState $script:disk.PSObject.Copy()
$script:disk.offline=$false
Restore-DiskState $saved
if (!$script:disk.offline) { throw 'Offline disk state not restored' }
$script:disk.offline=$false
$saved = Save-DiskState $script:disk.PSObject.Copy()
$script:disk.uniqueId='OTHER'
try { Restore-DiskState $saved; throw 'Changed disk accepted' } catch { if ($_.Exception.Message -eq 'Changed disk accepted') { throw } }
if ($script:disk.offline) { throw 'Changed disk was modified' }
Write-Output 'Disk state safety checks passed.'
