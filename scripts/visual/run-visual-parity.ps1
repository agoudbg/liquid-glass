param(
  [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'pinned-visual-chrome.ps1')

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$chromeExecutable = Resolve-PinnedVisualChrome
$env:LIQUID_GLASS_VISUAL_CHROME_PATH = $chromeExecutable

if ($PrepareOnly) {
  Write-Output $chromeExecutable
  exit 0
}

$playwrightCommand = Join-Path $repositoryRoot 'node_modules\.bin\playwright.CMD'
if (!(Test-Path -LiteralPath $playwrightCommand -PathType Leaf)) {
  throw "The workspace Playwright command was not found: $playwrightCommand"
}

Push-Location $repositoryRoot
try {
  & $playwrightCommand @(
    'test',
    '--config',
    'playwright.config.ts',
    '--project=visual-dpr-1',
    '--project=visual-dpr-2',
    '--workers=1'
  )
  $playwrightExitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
exit $playwrightExitCode
