# Parse all Windows helpers without executing an entry point or accessing a disk.
function Get-EngineSyntax {
	$directory = Join-Path $PSScriptRoot '../Source/Application/Windows'
	foreach ($file in Get-ChildItem -LiteralPath $directory -Filter '*.ps1') {
		$tokens = $null
		$parseErrors = $null
		$syntax = [Management.Automation.Language.Parser]::ParseFile(
			$file.FullName,
			[ref]$tokens,
			[ref]$parseErrors
		)
		if ($parseErrors.Count) {
			throw ($parseErrors | Out-String)
		}
		$syntax
	}
}
