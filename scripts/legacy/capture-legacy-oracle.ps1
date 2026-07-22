param(
  [string]$LegacyCommit = '345a9be6906bcc8a801208054e7fe134c6bfe641',
  [int]$Port = 4177,
  [ValidateSet(1, 2)] [int[]]$DevicePixelRatios = @(1, 2),
  [switch]$GlassOffOnly
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runId = "{0}-{1}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
$isolatedRoot = Join-Path $env:TEMP "codex-legacy-oracle-$runId"
$archivePath = Join-Path $isolatedRoot 'legacy.zip'
$sourceRoot = Join-Path $isolatedRoot 'source'
$calibrationRoot = Join-Path $env:TEMP 'liquid-glass-legacy-oracle-calibration'
$storeRoot = Join-Path $env:TEMP 'codex-pnpm-store-liquid-glass'
$serverProcess = $null
$sessionNames = $DevicePixelRatios | ForEach-Object { "legacy-dpr$_" }

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory)] [string]$FilePath,
    [Parameter(Mandatory)] [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
}

function Wait-ForServer {
  param([Parameter(Mandatory)] [uri]$Uri)

  for ($attempt = 1; $attempt -le 60; $attempt += 1) {
    try {
      $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "Legacy oracle server did not become ready at $Uri."
}

function Stop-OwnedProcessTree {
  param([Parameter(Mandatory)] [int]$RootProcessId)

  $processSnapshot = Get-CimInstance Win32_Process
  $pending = [Collections.Generic.Queue[int]]::new()
  $ownedProcessIds = [Collections.Generic.List[int]]::new()
  $pending.Enqueue($RootProcessId)
  while ($pending.Count -gt 0) {
    $processId = $pending.Dequeue()
    $ownedProcessIds.Add($processId)
    foreach ($child in $processSnapshot | Where-Object ParentProcessId -eq $processId) {
      $pending.Enqueue($child.ProcessId)
    }
  }

  for ($index = $ownedProcessIds.Count - 1; $index -ge 0; $index -= 1) {
    Stop-Process -Id $ownedProcessIds[$index] -Force -ErrorAction SilentlyContinue
  }
}

New-Item -ItemType Directory -Path $isolatedRoot, $sourceRoot, $calibrationRoot, $storeRoot -Force | Out-Null

try {
  Push-Location $repositoryRoot
  try {
    Invoke-CheckedCommand git @('-c', 'safe.directory=*', 'archive', '--format=zip', "--output=$archivePath", $LegacyCommit)
  } finally {
    Pop-Location
  }

  Expand-Archive -LiteralPath $archivePath -DestinationPath $sourceRoot
  $oracleSource = Join-Path $sourceRoot 'src\oracle'
  New-Item -ItemType Directory -Path $oracleSource -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $repositoryRoot 'tests\legacy-oracle\harness\OracleApp.vue') -Destination (Join-Path $oracleSource 'OracleApp.vue')
  Copy-Item -LiteralPath (Join-Path $repositoryRoot 'tests\legacy-oracle\harness\oracle.css') -Destination (Join-Path $oracleSource 'oracle.css')
  Copy-Item -LiteralPath (Join-Path $repositoryRoot 'tests\legacy-oracle\harness\main.ts') -Destination (Join-Path $sourceRoot 'src\main.ts')

  Push-Location $sourceRoot
  try {
    Invoke-CheckedCommand pnpm @(
      'install',
      '--frozen-lockfile',
      '--prefer-offline',
      '--network-concurrency=1',
      '--fetch-retries=5',
      '--fetch-timeout=30000',
      '--store-dir',
      $storeRoot
    )
    Invoke-CheckedCommand pnpm @('build:demo')
  } finally {
    Pop-Location
  }

  $existingListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($existingListener) {
    throw "Port $Port is already in use; refusing to capture from an unknown server."
  }

  $serverOutput = Join-Path $isolatedRoot 'preview.stdout.log'
  $serverError = Join-Path $isolatedRoot 'preview.stderr.log'
  $nodePath = (Get-Command node -ErrorAction Stop).Source
  $vitePath = Join-Path $sourceRoot 'node_modules\vite\bin\vite.js'
  $viteConfigPath = Join-Path $sourceRoot 'vite.demo.config.ts'
  $serverProcess = Start-Process -FilePath $nodePath `
    -ArgumentList @($vitePath, 'preview', '--config', $viteConfigPath, '--host', '127.0.0.1', '--port', $Port, '--strictPort') `
    -WorkingDirectory $sourceRoot `
    -RedirectStandardOutput $serverOutput `
    -RedirectStandardError $serverError `
    -WindowStyle Hidden `
    -PassThru
  Wait-ForServer -Uri "http://127.0.0.1:$Port/"

  $visualRoot = Join-Path $repositoryRoot 'tests\baselines\legacy\visual'
  foreach ($dpr in $DevicePixelRatios) {
    New-Item -ItemType Directory -Path (Join-Path $visualRoot "dpr-$dpr") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $calibrationRoot "dpr-$dpr") -Force | Out-Null
  }

  $artifactUrlPath = [uri]::EscapeDataString(($visualRoot -replace '\\', '/'))
  $calibrationUrlPath = [uri]::EscapeDataString(($calibrationRoot -replace '\\', '/'))
  foreach ($dpr in $DevicePixelRatios) {
    $sessionName = "legacy-dpr$dpr"
    $configPath = Join-Path $repositoryRoot "tests\legacy-oracle\config\dpr-$dpr.json"
    $captureFile = if ($GlassOffOnly) { 'capture-glass-off-run-code.js' } else { 'capture-run-code.js' }
    $capturePath = Join-Path $repositoryRoot "tests\legacy-oracle\$captureFile"
    $initialUrl = "http://127.0.0.1:$Port/?scene=S001&artifactRoot=$artifactUrlPath&calibrationRoot=$calibrationUrlPath"

    Invoke-CheckedCommand playwright-cli @("-s=$sessionName", 'open', $initialUrl, '--config', $configPath)
    $rawMetadata = & playwright-cli "-s=$sessionName" --raw run-code "--filename=$capturePath"
    if ($LASTEXITCODE -ne 0) {
      throw "Playwright capture failed for DPR $dpr."
    }
    $metadataText = ($rawMetadata -join [Environment]::NewLine).Trim()
    $rawOutputPath = Join-Path $isolatedRoot "playwright-dpr-$dpr.raw.txt"
    [IO.File]::WriteAllText($rawOutputPath, $metadataText, [Text.UTF8Encoding]::new($false))
    try {
      $null = $metadataText | ConvertFrom-Json
    } catch {
      Write-Host "Invalid Playwright output saved at $rawOutputPath"
      Write-Host $metadataText
      throw
    }
    if (!$GlassOffOnly) {
      [IO.File]::WriteAllText(
        (Join-Path $visualRoot "browser-dpr-$dpr.json"),
        "$metadataText$([Environment]::NewLine)",
        [Text.UTF8Encoding]::new($false)
      )
    }
    Invoke-CheckedCommand playwright-cli @("-s=$sessionName", 'close')
  }

  Invoke-CheckedCommand node @(
    (Join-Path $repositoryRoot 'scripts\legacy\analyze-legacy-oracle.mjs'),
    $repositoryRoot,
    $calibrationRoot
  )

  Write-Host "Legacy visual oracle passed. Isolated source: $sourceRoot"
  Write-Host "Calibration captures: $calibrationRoot"
} finally {
  foreach ($sessionName in $sessionNames) {
    & playwright-cli "-s=$sessionName" close 2>$null | Out-Null
  }
  if ($serverProcess) {
    Stop-OwnedProcessTree -RootProcessId $serverProcess.Id
  }
}
