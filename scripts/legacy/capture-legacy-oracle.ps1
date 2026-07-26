param(
  [string]$LegacyCommit = '345a9be6906bcc8a801208054e7fe134c6bfe641',
  [int]$Port = 4177,
  [ValidateSet(1, 2)] [int[]]$DevicePixelRatios = @(1, 2),
  [switch]$GlassOffOnly
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'legacy-capture-helpers.ps1')
. (Join-Path $PSScriptRoot 'legacy-capture-validation.ps1')
. (Join-Path $PSScriptRoot 'legacy-promotion-transaction.ps1')
$DevicePixelRatios = @($DevicePixelRatios | Sort-Object -Unique)
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runId = "{0}-{1}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
$isolatedRoot = Join-Path $env:TEMP "codex-legacy-oracle-$runId"
$archivePath = Join-Path $isolatedRoot 'legacy.zip'
$sourceRoot = Join-Path $isolatedRoot 'source'
$calibrationRoot = Join-Path $isolatedRoot 'calibration'
$isolatedConfigRoot = Join-Path $isolatedRoot 'playwright-config'
$storeRoot = Join-Path $env:TEMP 'codex-pnpm-store-liquid-glass'
$captureEvidenceRoot = Join-Path $isolatedRoot 'capture-evidence'
$captureContractInputPath = Join-Path $captureEvidenceRoot 'capture-contract-input.json'
$currentEnvironmentInputPath = Join-Path $captureEvidenceRoot 'current-environment-input.json'
$captureContractPath = Join-Path $captureEvidenceRoot 'capture-contract.json'
$toolchainSnapshotRoot = Join-Path $isolatedRoot 'toolchain-snapshot'
$worktreeCaptureContractToolPath = Join-Path $PSScriptRoot 'legacy-capture-contract.mjs'
$worktreeSnapshotToolPath = Join-Path $PSScriptRoot 'legacy-toolchain-snapshot.mjs'
$trustedToolchainRoot = $repositoryRoot
$captureContractToolPath = $worktreeCaptureContractToolPath
$baselineParent = Join-Path $repositoryRoot 'tests\baselines'
$baselineRoot = Get-LegacyPromotionTreePath `
  -BaselineParent $baselineParent `
  -PromotionRunId $runId `
  -Role Baseline
$stagedBaselineRoot = Get-LegacyPromotionTreePath `
  -BaselineParent $baselineParent `
  -PromotionRunId $runId `
  -Role Staged
$captureLockPath = Join-Path $baselineParent '.legacy-capture.lock'
$diagnosticBaselineRoot = Join-Path $isolatedRoot 'diagnostic-baseline'
$failedBaselineRoot = Join-Path $isolatedRoot 'failed-baseline'
$serverProcess = $null
$captureLock = $null
$toolchainSnapshotLease = $null
$toolchainEvidenceAtStart = $null
$sessionNames = $DevicePixelRatios | ForEach-Object { "legacy-$runId-dpr$_" }
$probeSessionName = "legacy-$runId-contract-probe"
$sessionNames = @($sessionNames) + $probeSessionName
$captureMode = if ($GlassOffOnly) { 'glass-off' } else { 'full' }
$publishableCapture = (
  !$GlassOffOnly `
  -and $DevicePixelRatios.Count -eq 2 `
  -and $DevicePixelRatios[0] -eq 1 `
  -and $DevicePixelRatios[1] -eq 2
)

function Assert-PublishableToolchain {
  if (!$publishableCapture) { return }
  [void](Assert-TrustedToolchainSnapshot `
    -SnapshotRoot $trustedToolchainRoot `
    -ExpectedEvidence $toolchainEvidenceAtStart)
}

function Get-CurrentCaptureContractInput {
  param(
    [Parameter(Mandatory)] [string]$ChromeExecutablePath,
    [Parameter(Mandatory)] [string]$ChromeProductVersion,
    [Parameter(Mandatory)] [string]$ToolchainRoot,
    [Parameter(Mandatory)] [string]$ProbeConfigPath,
    [Parameter(Mandatory)] [string]$ProbeRawOutputPath
  )

  $probeUrl = "http://127.0.0.1:$Port/?scene=S001"
  $probePath = Join-Path $ToolchainRoot 'tests\legacy-oracle\capture-contract-probe.js'
  Invoke-CheckedCommand playwright-cli @(
    "-s=$probeSessionName",
    'open',
    $probeUrl,
    '--config',
    $ProbeConfigPath
  ) | Out-Host
  try {
    $probeText = Invoke-CapturedCommand playwright-cli @(
      "-s=$probeSessionName",
      '--raw',
      'run-code',
      "--filename=$probePath"
    )
  } finally {
    Invoke-CheckedCommand playwright-cli @(
      "-s=$probeSessionName",
      'close'
    ) | Out-Host
  }
  try {
    $probe = $probeText | ConvertFrom-Json
  } catch {
    [IO.File]::WriteAllText(
      $ProbeRawOutputPath,
      $probeText,
      [Text.UTF8Encoding]::new($false)
    )
    throw
  }
  $hostJson = Invoke-CapturedCommand node @(
    '-e',
    "const os=require('node:os');process.stdout.write(JSON.stringify({platform:os.platform(),arch:os.arch(),osRelease:os.release()}))"
  )
  $playwrightRuntime = Get-PlaywrightRuntimeEvidence `
    -ToolchainRoot $ToolchainRoot
  return [ordered]@{
    chromeExecutablePath = $ChromeExecutablePath
    chromeProductVersion = $ChromeProductVersion
    host = ($hostJson | ConvertFrom-Json)
    nodeVersion = (Invoke-CapturedCommand node @('--version')).TrimStart('v')
    playwrightCliLauncherDigest = $playwrightRuntime.playwrightCliLauncherDigest
    playwrightCliPackageDigest = $playwrightRuntime.playwrightCliPackageDigest
    playwrightRuntimePackageDigest = $playwrightRuntime.playwrightRuntimePackageDigest
    playwrightCliVersion = $playwrightRuntime.playwrightCliVersion
    pnpmVersion = (Invoke-CapturedCommand pnpm @('--version'))
    playwrightCoreVersion = $playwrightRuntime.playwrightCoreVersion
    probe = $probe
    windowsDirectory = $env:WINDIR
  }
}

New-Item -ItemType Directory -Path $isolatedRoot, $sourceRoot, $calibrationRoot, $isolatedConfigRoot, $storeRoot, $captureEvidenceRoot -Force | Out-Null

try {
  try {
    $captureLock = [IO.File]::Open(
      $captureLockPath,
      [IO.FileMode]::OpenOrCreate,
      [IO.FileAccess]::ReadWrite,
      [IO.FileShare]::None
    )
  } catch [IO.IOException] {
    throw "Another legacy oracle capture owns $captureLockPath."
  }
  Restore-LegacyInterruptedPromotion -BaselineParent $baselineParent
  $baselineDigestAtStart = Get-DirectoryDigest -Root $baselineRoot
  $toolchainEvidenceAtStart = Invoke-CapturedCommand node @(
      $worktreeCaptureContractToolPath,
      'repository-evidence',
      $repositoryRoot
    ) | ConvertFrom-Json
  $toolchainDigestAtStart = Assert-LowercaseSha256 `
    -Value $toolchainEvidenceAtStart.digest `
    -Label 'Initial capture toolchain digest'
  if ($publishableCapture) {
    $snapshotDigest = Assert-LowercaseSha256 `
      -Value (Invoke-CapturedCommand node @(
        $worktreeSnapshotToolPath,
        'create',
        $repositoryRoot,
        $toolchainSnapshotRoot,
        $toolchainDigestAtStart
      )) `
      -Label 'Created toolchain snapshot SHA-256'
    if ($snapshotDigest -cne $toolchainDigestAtStart) {
      throw 'Toolchain snapshot differs from the capture startup digest.'
    }
    $trustedToolchainRoot = $toolchainSnapshotRoot
    $captureContractToolPath = Join-Path `
      $trustedToolchainRoot `
      'scripts\legacy\legacy-capture-contract.mjs'
    $verifiedSnapshotDigest = Assert-TrustedToolchainSnapshot `
      -SnapshotRoot $trustedToolchainRoot `
      -ExpectedEvidence $toolchainEvidenceAtStart
    if ($verifiedSnapshotDigest -cne $toolchainDigestAtStart) {
      throw 'Verified toolchain snapshot differs from capture startup.'
    }
    $toolchainSnapshotLease = Open-TrustedToolchainSnapshotLease `
      -SnapshotRoot $trustedToolchainRoot `
      -ExpectedEvidence $toolchainEvidenceAtStart
    Assert-PublishableToolchain
  }
  $resolvedLegacyCommit = Resolve-GitCommit -RepositoryRoot $repositoryRoot -Revision $LegacyCommit
  if (!$publishableCapture) {
    $existingReportPath = Join-Path $repositoryRoot 'tests\baselines\legacy\visual-calibration.json'
    if (!(Test-Path -LiteralPath $existingReportPath -PathType Leaf)) {
      throw "A diagnostic capture requires existing calibration evidence at $existingReportPath."
    }
    $existingReport = Get-Content -LiteralPath $existingReportPath -Raw | ConvertFrom-Json
    if ($existingReport.sourceCommit -cne $resolvedLegacyCommit) {
      throw "Existing calibration evidence belongs to a different legacy commit."
    }
  }
  if (Test-Path -LiteralPath $stagedBaselineRoot) {
    throw "Refusing to overwrite an existing legacy baseline staging directory."
  }
  Copy-Item -LiteralPath $baselineRoot -Destination $stagedBaselineRoot -Recurse
  $stagedVisualRoot = Resolve-SafeDirectChildPath `
    -ParentRoot $stagedBaselineRoot `
    -CandidatePath (Join-Path $stagedBaselineRoot 'visual') `
    -LeafPattern '^visual$' `
    -ExistingType Container
  if (Test-Path -LiteralPath $stagedVisualRoot) {
    Remove-Item -LiteralPath $stagedVisualRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Path $stagedVisualRoot -Force | Out-Null
  $stagedReportPath = Join-Path $stagedBaselineRoot 'visual-calibration.json'
  if (Test-Path -LiteralPath $stagedReportPath) {
    Remove-Item -LiteralPath $stagedReportPath -Force
  }
  Push-Location $repositoryRoot
  try {
    Invoke-CheckedCommand git @('-c', 'safe.directory=*', 'archive', '--format=zip', "--output=$archivePath", $resolvedLegacyCommit)
  } finally {
    Pop-Location
  }

  Expand-Archive -LiteralPath $archivePath -DestinationPath $sourceRoot
  $oracleSource = Join-Path $sourceRoot 'src\oracle'
  New-Item -ItemType Directory -Path $oracleSource -Force | Out-Null
  Assert-PublishableToolchain
  Copy-Item -LiteralPath (Join-Path $trustedToolchainRoot 'tests\legacy-oracle\harness\OracleApp.vue') -Destination (Join-Path $oracleSource 'OracleApp.vue')
  Copy-Item -LiteralPath (Join-Path $trustedToolchainRoot 'tests\legacy-oracle\harness\oracle.css') -Destination (Join-Path $oracleSource 'oracle.css')
  Copy-Item -LiteralPath (Join-Path $trustedToolchainRoot 'tests\legacy-oracle\harness\main.ts') -Destination (Join-Path $sourceRoot 'src\main.ts')
  Assert-PublishableToolchain

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

  $chromeExecutablePath = Resolve-GoogleChromeExecutable
  $chromeProductVersion = (
    Get-Item -LiteralPath $chromeExecutablePath
  ).VersionInfo.ProductVersion.Trim()
  foreach ($dpr in @(1, 2)) {
    Assert-PublishableToolchain
    New-IsolatedPlaywrightConfig `
      -SourcePath (Join-Path $trustedToolchainRoot "tests\legacy-oracle\config\dpr-$dpr.json") `
      -DestinationPath (Join-Path $isolatedConfigRoot "dpr-$dpr.json") `
      -ChromeExecutablePath $chromeExecutablePath `
      -DevicePixelRatio $dpr
  }
  Assert-PublishableToolchain

  $probeConfigPath = Join-Path $isolatedConfigRoot 'dpr-1.json'
  Assert-PublishableToolchain
  $contractInput = Get-CurrentCaptureContractInput `
    -ChromeExecutablePath $chromeExecutablePath `
    -ChromeProductVersion $chromeProductVersion `
    -ToolchainRoot $trustedToolchainRoot `
    -ProbeConfigPath $probeConfigPath `
    -ProbeRawOutputPath (Join-Path $isolatedRoot 'contract-probe.raw.txt')
  Assert-PublishableToolchain
  [IO.File]::WriteAllText(
    $captureContractInputPath,
    "$($contractInput | ConvertTo-Json -Depth 30)$([Environment]::NewLine)",
    [Text.UTF8Encoding]::new($false)
  )
  $captureContractSha256 = Assert-LowercaseSha256 `
    -Value (Invoke-CapturedCommand node @(
      $captureContractToolPath,
      'create',
      $trustedToolchainRoot,
      $captureContractInputPath,
      $captureContractPath
    )) `
    -Label 'Created capture contract SHA-256'
  Assert-PublishableToolchain
  $captureContract = Get-Content -LiteralPath $captureContractPath -Raw |
    ConvertFrom-Json
  if (
    (Assert-LowercaseSha256 `
      -Value $captureContract.contractSha256 `
      -Label 'Capture contract envelope SHA-256') -cne $captureContractSha256 `
    -or $captureContract.contract.repository.digest -cne $toolchainDigestAtStart
  ) {
    throw 'Capture contract differs from the pre-build repository toolchain.'
  }

  $visualRoot = $stagedVisualRoot
  foreach ($dpr in $DevicePixelRatios) {
    New-Item -ItemType Directory -Path (Join-Path $visualRoot "dpr-$dpr") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $calibrationRoot "dpr-$dpr") -Force | Out-Null
  }

  $artifactUrlPath = [uri]::EscapeDataString(($visualRoot -replace '\\', '/'))
  $calibrationUrlPath = [uri]::EscapeDataString(($calibrationRoot -replace '\\', '/'))
  foreach ($dpr in $DevicePixelRatios) {
    $sessionName = "legacy-$runId-dpr$dpr"
    $configPath = Join-Path $isolatedConfigRoot "dpr-$dpr.json"
    $captureFile = if ($GlassOffOnly) { 'capture-glass-off-run-code.js' } else { 'capture-run-code.js' }
    $capturePath = Join-Path $trustedToolchainRoot "tests\legacy-oracle\$captureFile"
    $initialUrl = "http://127.0.0.1:$Port/?scene=S001&artifactRoot=$artifactUrlPath&calibrationRoot=$calibrationUrlPath&captureId=$runId&sourceCommit=$resolvedLegacyCommit&captureContractSha256=$captureContractSha256"

    Assert-PublishableToolchain
    Invoke-CheckedCommand playwright-cli @("-s=$sessionName", 'open', $initialUrl, '--config', $configPath)
    $rawMetadata = & playwright-cli "-s=$sessionName" --raw run-code "--filename=$capturePath"
    if ($LASTEXITCODE -ne 0) {
      throw "Playwright capture failed for DPR $dpr."
    }
    Assert-PublishableToolchain
    $metadataText = ($rawMetadata -join [Environment]::NewLine).Trim()
    $rawOutputPath = Join-Path $isolatedRoot "playwright-dpr-$dpr.raw.txt"
    [IO.File]::WriteAllText($rawOutputPath, $metadataText, [Text.UTF8Encoding]::new($false))
    try {
      $metadata = $metadataText | ConvertFrom-Json
    } catch {
      Write-Host "Invalid Playwright output saved at $rawOutputPath"
      Write-Host $metadataText
      throw
    }
    if (
      $metadata.schemaVersion -ne 3 `
      -or $metadata.captureContractSha256 -cne $captureContractSha256 `
      -or $metadata.captureId -cne $runId `
      -or $metadata.captureMode -cne $captureMode `
      -or $metadata.sourceCommit -cne $resolvedLegacyCommit
    ) {
      throw "Browser evidence does not match this capture invocation."
    }
    $metadataText = $metadata | ConvertTo-Json -Depth 100 -Compress
    [IO.File]::WriteAllText(
      (Join-Path $captureEvidenceRoot "browser-dpr-$dpr.json"),
      "$metadataText$([Environment]::NewLine)",
      [Text.UTF8Encoding]::new($false)
    )
    if (!$GlassOffOnly) {
      [IO.File]::WriteAllText(
        (Join-Path $visualRoot "browser-dpr-$dpr.json"),
        "$metadataText$([Environment]::NewLine)",
        [Text.UTF8Encoding]::new($false)
      )
    }
    Invoke-CheckedCommand playwright-cli @("-s=$sessionName", 'close')
  }

  if ($publishableCapture) {
    Assert-PublishableToolchain
    Invoke-CheckedCommand node @(
      (Join-Path $trustedToolchainRoot 'scripts\legacy\analyze-legacy-oracle.mjs'),
      $trustedToolchainRoot,
      $calibrationRoot,
      $resolvedLegacyCommit,
      $captureMode,
      $runId,
      $captureEvidenceRoot,
      ($DevicePixelRatios -join ','),
      $stagedBaselineRoot,
      $captureContractPath
    )
    Assert-PublishableToolchain
    Assert-CompleteLegacyCapture `
      -StagedRoot $stagedBaselineRoot `
      -CalibrationRoot $calibrationRoot
    $currentChromeExecutablePath = Resolve-GoogleChromeExecutable
    $currentChromeProductVersion = (
      Get-Item -LiteralPath $currentChromeExecutablePath
    ).VersionInfo.ProductVersion.Trim()
    New-IsolatedPlaywrightConfig `
      -SourcePath (Join-Path $trustedToolchainRoot 'tests\legacy-oracle\config\dpr-1.json') `
      -DestinationPath $probeConfigPath `
      -ChromeExecutablePath $currentChromeExecutablePath `
      -DevicePixelRatio 1
    Assert-PublishableToolchain
    $currentEnvironmentInput = Get-CurrentCaptureContractInput `
      -ChromeExecutablePath $currentChromeExecutablePath `
      -ChromeProductVersion $currentChromeProductVersion `
      -ToolchainRoot $trustedToolchainRoot `
      -ProbeConfigPath $probeConfigPath `
      -ProbeRawOutputPath (Join-Path $isolatedRoot 'current-environment-probe.raw.txt')
    Assert-PublishableToolchain
    [IO.File]::WriteAllText(
      $currentEnvironmentInputPath,
      "$($currentEnvironmentInput | ConvertTo-Json -Depth 30)$([Environment]::NewLine)",
      [Text.UTF8Encoding]::new($false)
    )
    $verifiedContractSha256 = Assert-LowercaseSha256 `
      -Value (Invoke-CapturedCommand node @(
        $captureContractToolPath,
        'verify-current-environment',
        $repositoryRoot,
        $currentEnvironmentInputPath,
        $captureContractPath
      )) `
      -Label 'Verified current capture environment SHA-256'
    Assert-PublishableToolchain
    if ($verifiedContractSha256 -cne $captureContractSha256) {
      throw "Capture contract identity changed before baseline promotion."
    }
    if ((Get-DirectoryDigest -Root $baselineRoot) -cne $baselineDigestAtStart) {
      throw "Committed legacy baselines changed during capture; refusing to overwrite concurrent work."
    }
    Assert-PublishableToolchain
    $stagedDigest = Get-DirectoryDigest -Root $stagedBaselineRoot
    Invoke-LegacyBaselinePromotion `
      -BaselineParent $baselineParent `
      -PromotionRunId $runId `
      -ExpectedOriginalDigest $baselineDigestAtStart `
      -ExpectedStagedDigest $stagedDigest
    Write-Host "Legacy visual oracle passed and was promoted as one complete batch."
  } else {
    Copy-Item -LiteralPath $stagedBaselineRoot -Destination $diagnosticBaselineRoot -Recurse
    Remove-LegacyPromotionTree `
      -BaselineParent $baselineParent `
      -PromotionRunId $runId `
      -Role Staged
    Write-Host "Diagnostic capture completed without changing committed baselines."
    Write-Host "Diagnostic baseline output: $diagnosticBaselineRoot"
  }
  Write-Host "Isolated source: $sourceRoot"
  Write-Host "Calibration captures: $calibrationRoot"
  Write-Host "Capture evidence: $captureEvidenceRoot"
} finally {
  foreach ($sessionName in $sessionNames) {
    & playwright-cli "-s=$sessionName" close 2>$null | Out-Null
  }
  if ($serverProcess) {
    Stop-OwnedProcessTree -RootProcessId $serverProcess.Id
  }
  if ($toolchainSnapshotLease) {
    foreach ($handle in $toolchainSnapshotLease.Handles) {
      $handle.Dispose()
    }
  }
  if (Test-Path -LiteralPath $stagedBaselineRoot -PathType Container) {
    if (!(Test-Path -LiteralPath $failedBaselineRoot)) {
      Copy-Item -LiteralPath $stagedBaselineRoot -Destination $failedBaselineRoot -Recurse
    }
    Remove-LegacyPromotionTree `
      -BaselineParent $baselineParent `
      -PromotionRunId $runId `
      -Role Staged
    Write-Host "Failed staged baseline preserved at $failedBaselineRoot"
  }
  if ($captureLock) {
    $captureLock.Dispose()
    Remove-Item -LiteralPath $captureLockPath -Force -ErrorAction SilentlyContinue
  }
}
