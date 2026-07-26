function Assert-CompleteLegacyCapture {
  param(
    [Parameter(Mandatory)] [string]$StagedRoot,
    [Parameter(Mandatory)] [string]$CalibrationRoot
  )

  $expectedVisualFiles = [Collections.Generic.List[string]]::new()
  foreach ($dpr in @(1, 2)) {
    $expectedVisualFiles.Add("browser-dpr-$dpr.json")
    foreach ($scenario in @('S001', 'S002', 'S003', 'S004', 'S005', 'S006')) {
      foreach ($suffix in @('canvas', 'glass-off', 'glass-on')) {
        $expectedVisualFiles.Add("dpr-$dpr/$scenario-$suffix.png")
      }
    }
  }
  $visualRoot = Join-Path $StagedRoot 'visual'
  $actualVisualFiles = @(
    Get-ChildItem -LiteralPath $visualRoot -File -Recurse |
      ForEach-Object {
        [IO.Path]::GetRelativePath($visualRoot, $_.FullName).Replace('\', '/')
      }
  )
  $missingVisualFiles = @(
    $expectedVisualFiles | Where-Object { $actualVisualFiles -cnotcontains $_ }
  )
  $unexpectedVisualFiles = @(
    $actualVisualFiles | Where-Object { $expectedVisualFiles -cnotcontains $_ }
  )
  if ($missingVisualFiles.Count -gt 0 -or $unexpectedVisualFiles.Count -gt 0) {
    throw "Staged visual artifact set is incomplete. Missing: $($missingVisualFiles -join ', '); unexpected: $($unexpectedVisualFiles -join ', ')."
  }

  $calibrationFiles = @(Get-ChildItem -LiteralPath $CalibrationRoot -File -Recurse)
  if ($calibrationFiles.Count -ne 240) {
    throw "A publishable capture requires exactly 240 calibration screenshots."
  }
  foreach ($dpr in @(1, 2)) {
    foreach ($scenario in @('S001', 'S002', 'S003', 'S004', 'S005', 'S006')) {
      foreach ($run in 1..20) {
        $runName = $run.ToString('00')
        $path = Join-Path $CalibrationRoot "dpr-$dpr\$scenario-run-$runName.png"
        if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
          throw "Missing calibration screenshot: $path"
        }
      }
    }
  }
}

function Assert-TrustedToolchainSnapshot {
  param(
    [Parameter(Mandatory)] [string]$SnapshotRoot,
    [Parameter(Mandatory)] [object]$ExpectedEvidence
  )

  $expectedDigest = Assert-LowercaseSha256 `
    -Value $ExpectedEvidence.digest `
    -Label 'In-memory toolchain evidence digest'
  $canonicalRoot = Resolve-CanonicalExistingPath -Path $SnapshotRoot
  $rootPrefix = [IO.Path]::TrimEndingDirectorySeparator($canonicalRoot) +
    [IO.Path]::DirectorySeparatorChar
  $expectedFiles = @($ExpectedEvidence.files)
  if ($expectedFiles.Count -eq 0) {
    throw 'In-memory toolchain evidence must contain protected files.'
  }

  $expectedHashes = @{}
  foreach ($entry in $expectedFiles) {
    $path = $entry.path
    if (
      $path -isnot [string] `
      -or $path.Length -eq 0 `
      -or $path -cne $path.Replace('\', '/') `
      -or [IO.Path]::IsPathFullyQualified($path) `
      -or $path -match '(^|/)\.\.?(/|$)'
    ) {
      throw "In-memory toolchain evidence contains an unsafe path: '$path'."
    }
    if ($expectedHashes.ContainsKey($path)) {
      throw "In-memory toolchain evidence contains a duplicate path: '$path'."
    }
    $expectedHashes[$path] = Assert-LowercaseSha256 `
      -Value $entry.sha256 `
      -Label "In-memory toolchain evidence for $path"
  }

  $snapshotItems = @(Get-ChildItem -LiteralPath $SnapshotRoot -Force -Recurse)
  foreach ($item in $snapshotItems) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Toolchain snapshot contains a reparse point: '$($item.FullName)'."
    }
  }
  $actualPaths = @(
    $snapshotItems |
      Where-Object { !$_.PSIsContainer } |
      ForEach-Object {
        [IO.Path]::GetRelativePath($SnapshotRoot, $_.FullName).Replace('\', '/')
      }
  )
  if (
    $actualPaths.Count -ne $expectedHashes.Count `
    -or @($actualPaths | Where-Object { !$expectedHashes.ContainsKey($_) }).Count -gt 0
  ) {
    throw 'Toolchain snapshot does not contain the exact in-memory path set.'
  }

  foreach ($path in $expectedHashes.Keys) {
    $candidatePath = Join-Path $SnapshotRoot $path.Replace('/', '\')
    $canonicalCandidate = Resolve-CanonicalExistingPath -Path $candidatePath
    if (!$canonicalCandidate.StartsWith(
      $rootPrefix,
      [StringComparison]::OrdinalIgnoreCase
    )) {
      throw "Toolchain snapshot file escapes its root: '$path'."
    }
    $actualHash = (
      Get-FileHash -LiteralPath $candidatePath -Algorithm SHA256
    ).Hash.ToLowerInvariant()
    if ($actualHash -cne $expectedHashes[$path]) {
      throw "Toolchain snapshot file changed after capture start: '$path'."
    }
  }
  return $expectedDigest
}

function Open-TrustedToolchainSnapshotLease {
  param(
    [Parameter(Mandatory)] [string]$SnapshotRoot,
    [Parameter(Mandatory)] [object]$ExpectedEvidence
  )

  [void](Assert-TrustedToolchainSnapshot `
    -SnapshotRoot $SnapshotRoot `
    -ExpectedEvidence $ExpectedEvidence)
  $handles = [Collections.Generic.List[IO.FileStream]]::new()
  try {
    foreach ($entry in @($ExpectedEvidence.files)) {
      $path = Join-Path $SnapshotRoot ([string]$entry.path).Replace('/', '\')
      $handles.Add([IO.File]::Open(
        $path,
        [IO.FileMode]::Open,
        [IO.FileAccess]::Read,
        [IO.FileShare]::Read
      ))
    }
    [void](Assert-TrustedToolchainSnapshot `
      -SnapshotRoot $SnapshotRoot `
      -ExpectedEvidence $ExpectedEvidence)
    return [PSCustomObject]@{ Handles = $handles }
  } catch {
    foreach ($handle in $handles) { $handle.Dispose() }
    throw
  }
}
