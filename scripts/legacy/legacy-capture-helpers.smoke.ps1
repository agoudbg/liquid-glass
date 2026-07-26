$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'legacy-capture-helpers.ps1')

$temporaryRoot = Join-Path `
  ([IO.Path]::GetTempPath()) `
  "liquid-glass-config-smoke-$([guid]::NewGuid().ToString('N'))"
$sourcePath = Join-Path $temporaryRoot 'source.json'
$destinationPath = Join-Path $temporaryRoot 'generated.json'

try {
  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
  $driftedSource = [ordered]@{
    browser = [ordered]@{
      browserName = 'firefox'
      isolated = $false
      launchOptions = [ordered]@{
        channel = 'msedge'
        headless = $false
        args = @('--drifted')
      }
      contextOptions = [ordered]@{
        viewport = [ordered]@{ width = 1; height = 1 }
        deviceScaleFactor = 9
        colorScheme = 'dark'
        reducedMotion = 'no-preference'
        locale = 'fr-FR'
        timezoneId = 'Europe/Paris'
      }
    }
    marker = 'preserved'
  }
  [IO.File]::WriteAllText(
    $sourcePath,
    ($driftedSource | ConvertTo-Json -Depth 20),
    [Text.UTF8Encoding]::new($false)
  )

  $chromePath = Join-Path $temporaryRoot 'chrome.exe'
  New-IsolatedPlaywrightConfig `
    -SourcePath $sourcePath `
    -DestinationPath $destinationPath `
    -ChromeExecutablePath $chromePath `
    -DevicePixelRatio 2
  $generated = Get-Content -LiteralPath $destinationPath -Raw |
    ConvertFrom-Json
  $expectedArguments = @(
    '--enable-automation'
    '--use-gl=angle'
    '--use-angle=swiftshader'
    '--force-color-profile=srgb'
  )
  if (
    $generated.marker -cne 'preserved' `
    -or $generated.browser.browserName -cne 'chromium' `
    -or $generated.browser.isolated -ne $true `
    -or $generated.browser.launchOptions.headless -ne $true `
    -or $generated.browser.launchOptions.executablePath -cne $chromePath `
    -or ($generated.browser.launchOptions.args | ConvertTo-Json -Compress) `
      -cne ($expectedArguments | ConvertTo-Json -Compress) `
    -or $generated.browser.contextOptions.viewport.width -ne 1440 `
    -or $generated.browser.contextOptions.viewport.height -ne 900 `
    -or $generated.browser.contextOptions.deviceScaleFactor -ne 2 `
    -or $generated.browser.contextOptions.colorScheme -cne 'light' `
    -or $generated.browser.contextOptions.locale -cne 'en-US' `
    -or $generated.browser.contextOptions.reducedMotion -cne 'reduce' `
    -or $generated.browser.contextOptions.timezoneId -cne 'UTC'
  ) {
    throw 'Generated Playwright config does not match the fixed contract.'
  }
  Write-Output 'legacy capture config generator smoke: ok'
} finally {
  if (Test-Path -LiteralPath $temporaryRoot) {
    $resolvedRoot = [IO.Path]::GetFullPath($temporaryRoot)
    $expectedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (
      ![StringComparer]::OrdinalIgnoreCase.Equals(
        [IO.Path]::GetDirectoryName($resolvedRoot),
        [IO.Path]::TrimEndingDirectorySeparator($expectedParent)
      ) `
      -or [IO.Path]::GetFileName($resolvedRoot) `
        -cnotmatch '^liquid-glass-config-smoke-[a-f0-9]{32}$'
    ) {
      throw 'Refusing unsafe config smoke cleanup.'
    }
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
  }
}
