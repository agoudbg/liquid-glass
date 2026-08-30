$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'legacy-capture-helpers.ps1')
. (Join-Path $PSScriptRoot 'legacy-capture-validation.ps1')

$runId = [guid]::NewGuid().ToString('N')
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "legacy-validation-test-$runId"
$nestedRoot = Join-Path $temporaryRoot 'nested'
$firstPath = Join-Path $temporaryRoot 'a.txt'
$secondPath = Join-Path $nestedRoot 'b.txt'

try {
  New-Item -ItemType Directory -Path $nestedRoot -Force | Out-Null
  [IO.File]::WriteAllText($firstPath, "alpha`n")
  [IO.File]::WriteAllText($secondPath, "beta`n")
  $evidence = [PSCustomObject]@{
    digest = '1' * 64
    files = @(
      [PSCustomObject]@{
        path = 'a.txt'
        sha256 = (Get-FileHash -LiteralPath $firstPath -Algorithm SHA256).Hash.ToLowerInvariant()
      }
      [PSCustomObject]@{
        path = 'nested/b.txt'
        sha256 = (Get-FileHash -LiteralPath $secondPath -Algorithm SHA256).Hash.ToLowerInvariant()
      }
    )
  }
  $verifiedDigest = Assert-TrustedToolchainSnapshot `
    -SnapshotRoot $temporaryRoot `
    -ExpectedEvidence $evidence
  if ($verifiedDigest -cne $evidence.digest) {
    throw 'Trusted snapshot verification returned the wrong digest.'
  }

  $lease = Open-TrustedToolchainSnapshotLease `
    -SnapshotRoot $temporaryRoot `
    -ExpectedEvidence $evidence
  $writeWasBlocked = $false
  try {
    $nodeRead = Invoke-CapturedCommand node @(
      '-e',
      "process.stdout.write(require('node:fs').readFileSync(process.argv[1], 'utf8'))",
      $secondPath
    )
    if ($nodeRead -cne 'beta') {
      throw 'Trusted snapshot lease blocked a concurrent Node read.'
    }
    try {
      [IO.File]::WriteAllText($secondPath, "blocked`n")
    } catch [IO.IOException] {
      $writeWasBlocked = $true
    }
    if ($IsWindows -and !$writeWasBlocked) {
      throw 'Trusted snapshot lease did not block a concurrent write.'
    }
    if (!$writeWasBlocked) {
      # Unix file sharing is advisory, so integrity checks remain the portable guard.
      try {
        [void](Assert-TrustedToolchainSnapshot `
          -SnapshotRoot $temporaryRoot `
          -ExpectedEvidence $evidence)
        throw 'Concurrent snapshot mutation was accepted.'
      } catch {
        if ($_.Exception.Message -cnotmatch 'changed after capture start') { throw }
      }
    }
  } finally {
    foreach ($handle in $lease.Handles) { $handle.Dispose() }
  }

  [IO.File]::WriteAllText($secondPath, "changed`n")
  try {
    [void](Assert-TrustedToolchainSnapshot `
      -SnapshotRoot $temporaryRoot `
      -ExpectedEvidence $evidence)
    throw 'Changed snapshot bytes were accepted.'
  } catch {
    if ($_.Exception.Message -cnotmatch 'changed after capture start') { throw }
  }

  [IO.File]::WriteAllText($secondPath, "beta`n")
  [IO.File]::WriteAllText((Join-Path $temporaryRoot 'extra.txt'), "extra`n")
  try {
    [void](Assert-TrustedToolchainSnapshot `
      -SnapshotRoot $temporaryRoot `
      -ExpectedEvidence $evidence)
    throw 'An extra snapshot path was accepted.'
  } catch {
    if ($_.Exception.Message -cnotmatch 'exact in-memory path set') { throw }
  }
  Write-Output 'Legacy capture validation tests passed.'
} finally {
  $resolvedRoot = [IO.Path]::GetFullPath($temporaryRoot)
  $expectedParent = [IO.Path]::TrimEndingDirectorySeparator(
    [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  )
  if (
    ![StringComparer]::OrdinalIgnoreCase.Equals(
      [IO.Path]::GetDirectoryName($resolvedRoot),
      $expectedParent
    ) `
    -or [IO.Path]::GetFileName($resolvedRoot) `
      -cnotmatch '^legacy-validation-test-[a-f0-9]{32}$'
  ) {
    throw 'Refusing unsafe capture validation test cleanup.'
  }
  if (Test-Path -LiteralPath $resolvedRoot) {
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
  }
}
