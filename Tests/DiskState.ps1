$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '../Source/Application/Windows/Engine.ps1'
. (Join-Path $PSScriptRoot 'EngineFunctions.ps1')
$ast = Get-EngineSyntax
$applicationDirectory = Split-Path $source
$functions = $ast | ForEach-Object { $_.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in @('Identity','Save-DiskState','Restore-DiskState','Restore-DriveLetters') }, $true) }
foreach ($function in $functions) { . ([ScriptBlock]::Create($function.Extent.Text.Replace('$PSScriptRoot','$applicationDirectory'))) }
Add-Type 'public static class FfuVolume { public static bool IsOffline(string path) { return false; } public static void Offline(string path) { } public static void Online(string path) { } }'
$script:disk = [pscustomobject]@{ number=1; uniqueId='USB'; serial='123'; size=[UInt64]32000000000; name='Test'; bus='USB'; removable=$false; offline=$false; system=$false; boot=$false; paging=$false }
$script:partitions = @(
 [pscustomobject]@{ PartitionNumber=1; Type='Basic'; IsOffline=$false; AccessPaths=@() },
 [pscustomobject]@{ PartitionNumber=2; Type='Basic'; IsOffline=$true; AccessPaths=@() }
)
function Get-Disks { $script:disk }
function Get-Partition { [CmdletBinding()] param($DiskNumber, $PartitionNumber, $DriveLetter) if ($DriveLetter) { return }; if ($DiskNumber -ne 1) { throw 'Wrong disk' }; if ($PartitionNumber) { $script:partitions | Where-Object PartitionNumber -eq $PartitionNumber } else { $script:partitions } }
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
$script:disk.uniqueId='USB'
$script:partitions = @(
 [pscustomobject]@{ PartitionNumber=1; Type='Basic'; Guid='one'; IsOffline=$false; DriveLetter=[char]0; IsHidden=$false; NoDefaultDriveLetter=$false; IsSystem=$false; IsBoot=$false; FileSystem='NTFS' },
 [pscustomobject]@{ PartitionNumber=2; Type='Basic'; Guid='two'; IsOffline=$false; DriveLetter=[char]0; IsHidden=$true; NoDefaultDriveLetter=$false; IsSystem=$false; IsBoot=$false; FileSystem='NTFS' },
 [pscustomobject]@{ PartitionNumber=3; Type='Basic'; Guid='three'; IsOffline=$false; DriveLetter=[char]0; IsHidden=$false; NoDefaultDriveLetter=$true; IsSystem=$false; IsBoot=$false; FileSystem='FAT32' },
 [pscustomobject]@{ PartitionNumber=4; Type='Basic'; Guid='four'; IsOffline=$false; DriveLetter=[char]0; IsHidden=$false; NoDefaultDriveLetter=$false; IsSystem=$false; IsBoot=$false; FileSystem='exFAT' },
 [pscustomobject]@{ PartitionNumber=5; Type='Basic'; Guid='five'; IsOffline=$false; DriveLetter=[char]0; IsHidden=$false; NoDefaultDriveLetter=$false; IsSystem=$false; IsBoot=$false; FileSystem='RAW' },
 [pscustomobject]@{ PartitionNumber=6; Type='System'; Guid='six'; IsOffline=$false; DriveLetter=[char]0; IsHidden=$false; NoDefaultDriveLetter=$false; IsSystem=$true; IsBoot=$false; FileSystem='FAT32' }
)
function Update-Disk { param($Number) if ($Number -ne 1) { throw 'Wrong disk' } }
function Get-Volume { param([Parameter(ValueFromPipeline)]$Partition) process { $Partition } }
function Add-PartitionAccessPath { param([Parameter(ValueFromPipeline)]$Partition, $AccessPath, [switch]$AssignDriveLetter) process { $script:assigned += "$($Partition.Guid):$AccessPath$AssignDriveLetter" } }
$script:assigned = @()
$saved = [pscustomobject]@{ disk=$script:disk.PSObject.Copy(); partitions=@([pscustomobject]@{ guid='one'; letter='D'; offline=$false }) }
Restore-DriveLetters $saved
if ($script:assigned.Count -ne 2 -or $script:assigned[0] -ne 'one:D:\False' -or $script:assigned[1] -ne 'four:True') { throw "Wrong drive letters assigned: $script:assigned" }
$script:assigned = @()
$saved.disk.offline = $true
Restore-DriveLetters $saved
if ($script:assigned.Count) { throw 'Assigned letters on an offline disk' }
Write-Output 'Disk state safety checks passed.'
