if (
  $env:OS -eq 'Windows_NT' `
  -and -not ('LiquidGlass.LegacyCapture.NativePath' -as [type])
) {
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace LiquidGlass.LegacyCapture
{
    public static class NativePath
    {
        private const uint FileFlagBackupSemantics = 0x02000000;
        private const uint OpenExisting = 3;
        private const uint ShareReadWriteDelete = 7;

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateFile(
            string fileName,
            uint desiredAccess,
            uint shareMode,
            IntPtr securityAttributes,
            uint creationDisposition,
            uint flagsAndAttributes,
            IntPtr templateFile);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern uint GetFinalPathNameByHandle(
            SafeFileHandle file,
            StringBuilder filePath,
            uint filePathLength,
            uint flags);

        public static string Resolve(string path)
        {
            using (SafeFileHandle handle = CreateFile(
                path,
                0,
                ShareReadWriteDelete,
                IntPtr.Zero,
                OpenExisting,
                FileFlagBackupSemantics,
                IntPtr.Zero))
            {
                if (handle.IsInvalid)
                {
                    throw new Win32Exception(
                        Marshal.GetLastWin32Error(),
                        "Unable to open path for canonicalization: " + path);
                }

                int capacity = 512;
                StringBuilder buffer = new StringBuilder(capacity);
                uint length = GetFinalPathNameByHandle(
                    handle,
                    buffer,
                    (uint)buffer.Capacity,
                    0);
                if (length == 0)
                {
                    throw new Win32Exception(
                        Marshal.GetLastWin32Error(),
                        "Unable to canonicalize path: " + path);
                }
                if (length >= buffer.Capacity)
                {
                    buffer = new StringBuilder(checked((int)length + 1));
                    length = GetFinalPathNameByHandle(
                        handle,
                        buffer,
                        (uint)buffer.Capacity,
                        0);
                    if (length == 0 || length >= buffer.Capacity)
                    {
                        throw new Win32Exception(
                            Marshal.GetLastWin32Error(),
                            "Unable to canonicalize path: " + path);
                    }
                }

                string resolved = buffer.ToString();
                if (resolved.StartsWith(
                    @"\\?\UNC\",
                    StringComparison.OrdinalIgnoreCase))
                {
                    return @"\\" + resolved.Substring(8);
                }
                if (resolved.StartsWith(
                    @"\\?\",
                    StringComparison.OrdinalIgnoreCase))
                {
                    return resolved.Substring(4);
                }
                return resolved;
            }
        }
    }
}
'@
}

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

function Invoke-CapturedCommand {
  param(
    [Parameter(Mandatory)] [string]$FilePath,
    [Parameter(Mandatory)] [string[]]$Arguments
  )

  $output = @(& $FilePath @Arguments 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
  return ($output -join [Environment]::NewLine).Trim()
}

function Assert-LowercaseSha256 {
  param(
    [Parameter(Mandatory)] [AllowEmptyString()] [object]$Value,
    [Parameter(Mandatory)] [string]$Label
  )

  if ($Value -isnot [string] -or $Value -cnotmatch '^[a-f0-9]{64}$') {
    throw "$Label must be a lowercase 64-character SHA-256 digest."
  }
  return $Value
}

function Resolve-CanonicalExistingPath {
  param([Parameter(Mandatory)] [string]$Path)

  $resolvedPath = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).ProviderPath
  $fullPath = [IO.Path]::GetFullPath($resolvedPath)
  if ($env:OS -eq 'Windows_NT') {
    return [LiquidGlass.LegacyCapture.NativePath]::Resolve($fullPath)
  }
  return $fullPath
}

function Resolve-SafeDirectChildPath {
  param(
    [Parameter(Mandatory)] [string]$ParentRoot,
    [Parameter(Mandatory)] [string]$CandidatePath,
    [Parameter(Mandatory)] [string]$LeafPattern,
    [ValidateSet('Any', 'Container', 'Leaf')] [string]$ExistingType = 'Any'
  )

  $parentProviderPath = (
    Resolve-Path -LiteralPath $ParentRoot -ErrorAction Stop
  ).ProviderPath
  $parentFullPath = [IO.Path]::GetFullPath($parentProviderPath)
  $canonicalParent = Resolve-CanonicalExistingPath -Path $parentFullPath
  $candidateFullPath = [IO.Path]::GetFullPath($CandidatePath)
  $candidateLeaf = [IO.Path]::GetFileName(
    [IO.Path]::TrimEndingDirectorySeparator($candidateFullPath)
  )
  if ($candidateLeaf -cnotmatch $LeafPattern) {
    throw "Refusing unsafe direct-child path leaf: '$candidateLeaf'."
  }

  $candidateParent = [IO.Path]::GetDirectoryName(
    [IO.Path]::TrimEndingDirectorySeparator($candidateFullPath)
  )
  $canonicalCandidateParent = Resolve-CanonicalExistingPath -Path $candidateParent
  if (
    ![StringComparer]::OrdinalIgnoreCase.Equals(
      $canonicalParent,
      $canonicalCandidateParent
    )
  ) {
    throw "Refusing path outside its canonical parent: '$CandidatePath'."
  }

  $safePath = Join-Path $parentFullPath $candidateLeaf
  if (Test-Path -LiteralPath $safePath) {
    $item = Get-Item -LiteralPath $safePath -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing reparse point in a promotion path: '$safePath'."
    }
    if ($ExistingType -eq 'Container' -and !$item.PSIsContainer) {
      throw "Expected a directory promotion path: '$safePath'."
    }
    if ($ExistingType -eq 'Leaf' -and $item.PSIsContainer) {
      throw "Expected a file promotion path: '$safePath'."
    }
    $canonicalCandidate = Resolve-CanonicalExistingPath -Path $safePath
    $canonicalExpected = Join-Path $canonicalParent $candidateLeaf
    if (
      ![StringComparer]::OrdinalIgnoreCase.Equals(
        $canonicalExpected,
        $canonicalCandidate
      )
    ) {
      throw "Refusing a promotion path that resolves outside its parent."
    }
  }
  return $safePath
}

function Write-Utf8FileAtomically {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [AllowEmptyString()] [string]$Content
  )

  $directory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Path))
  $leaf = [IO.Path]::GetFileName($Path)
  $temporaryPath = Join-Path $directory ".$leaf.$([guid]::NewGuid().ToString('N')).tmp"
  $replacementBackupPath = Join-Path $directory ".$leaf.$([guid]::NewGuid().ToString('N')).bak"
  $stream = $null
  try {
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($Content)
    $stream = [IO.FileStream]::new(
      $temporaryPath,
      [IO.FileMode]::CreateNew,
      [IO.FileAccess]::Write,
      [IO.FileShare]::None,
      4096,
      [IO.FileOptions]::WriteThrough
    )
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush($true)
    $stream.Dispose()
    $stream = $null

    if (Test-Path -LiteralPath $Path -PathType Leaf) {
      [IO.File]::Replace(
        $temporaryPath,
        $Path,
        $replacementBackupPath,
        $true
      )
    } else {
      [IO.File]::Move($temporaryPath, $Path)
    }
  } finally {
    if ($stream) { $stream.Dispose() }
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
    if (Test-Path -LiteralPath $replacementBackupPath) {
      Remove-Item -LiteralPath $replacementBackupPath -Force
    }
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

function Resolve-GitCommit {
  param(
    [Parameter(Mandatory)] [string]$RepositoryRoot,
    [Parameter(Mandatory)] [string]$Revision
  )

  $resolvedOutput = @(
    & git -c 'safe.directory=*' -C $RepositoryRoot rev-parse --verify "${Revision}^{commit}" 2>&1
  )
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve legacy revision '$Revision': $($resolvedOutput -join [Environment]::NewLine)"
  }
  $resolvedCommit = ($resolvedOutput -join '').Trim()
  if ($resolvedCommit -cnotmatch '^[a-f0-9]{40}$') {
    throw "Resolved legacy revision is not a lowercase 40-character commit SHA: '$resolvedCommit'."
  }
  return $resolvedCommit
}

function Get-DirectoryDigest {
  param([Parameter(Mandatory)] [string]$Root)

  if (!(Test-Path -LiteralPath $Root -PathType Container)) {
    throw "Cannot hash missing directory: $Root"
  }
  $entries = @(
    Get-ChildItem -LiteralPath $Root -File -Recurse |
      Sort-Object FullName |
      ForEach-Object {
        $relativePath = [IO.Path]::GetRelativePath($Root, $_.FullName).Replace('\', '/')
        $fileHash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$relativePath`t$fileHash"
      }
  )
  $payload = [Text.Encoding]::UTF8.GetBytes(($entries -join "`n"))
  return [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData($payload)
  ).ToLowerInvariant()
}

function Resolve-GoogleChromeExecutable {
  $configuredPath = if ($env:LIQUID_GLASS_VISUAL_CHROME_PATH) {
    $env:LIQUID_GLASS_VISUAL_CHROME_PATH
  } else {
    $env:LIQUID_GLASS_VISUAL_CHROME_EXECUTABLE
  }
  if ($configuredPath) {
    $override = [IO.Path]::GetFullPath($configuredPath)
    if (!(Test-Path -LiteralPath $override -PathType Leaf)) {
      throw "Configured visual Chrome path does not identify a file: $override"
    }
    return $override
  }

  $candidates = [Collections.Generic.List[string]]::new()
  foreach ($registryPath in @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe'
  )) {
    if (Test-Path -LiteralPath $registryPath) {
      $candidate = (Get-ItemProperty -LiteralPath $registryPath).'(default)'
      if ($candidate) { $candidates.Add($candidate) }
    }
  }
  foreach ($root in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
    if ($root) {
      $candidates.Add((Join-Path $root 'Google\Chrome\Application\chrome.exe'))
    }
  }
  $resolved = @(
    $candidates |
      ForEach-Object { [IO.Path]::GetFullPath($_) } |
      Sort-Object -Unique |
      Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
  )
  if ($resolved.Count -eq 0) {
    throw 'Installed Google Chrome could not be resolved.'
  }
  return $resolved[0]
}

function Get-PlaywrightRuntimeEvidence {
  param([Parameter(Mandatory)] [string]$ToolchainRoot)

  $commandPath = (Get-Command playwright-cli -ErrorAction Stop).Source
  if (!(Test-Path -LiteralPath $commandPath -PathType Leaf)) {
    throw 'The resolved Playwright CLI launcher must be a file.'
  }
  $globalPackageRoot = [IO.Path]::GetDirectoryName($commandPath)
  $runtimeToolPath = Join-Path `
    $ToolchainRoot `
    'scripts\legacy\legacy-playwright-runtime.mjs'
  $evidence = Invoke-CapturedCommand node @(
    $runtimeToolPath,
    'capture',
    $globalPackageRoot,
    $commandPath
  ) | ConvertFrom-Json
  $commandVersion = Invoke-CapturedCommand playwright-cli @('--version')
  if ($evidence.playwrightCliVersion -cne $commandVersion) {
    throw 'Playwright CLI command and installed package versions differ.'
  }
  foreach ($digest in @(
    @{
      Label = 'Playwright CLI launcher digest'
      Value = $evidence.playwrightCliLauncherDigest
    },
    @{
      Label = 'Playwright CLI package digest'
      Value = $evidence.playwrightCliPackageDigest
    },
    @{
      Label = 'Playwright shared runtime package digest'
      Value = $evidence.playwrightRuntimePackageDigest
    }
  )) {
    [void](Assert-LowercaseSha256 `
      -Value $digest.Value `
      -Label $digest.Label)
  }
  return $evidence
}

function New-IsolatedPlaywrightConfig {
  param(
    [Parameter(Mandatory)] [string]$SourcePath,
    [Parameter(Mandatory)] [string]$DestinationPath,
    [Parameter(Mandatory)] [string]$ChromeExecutablePath,
    [Parameter(Mandatory)] [ValidateSet(1, 2)] [int]$DevicePixelRatio
  )

  $config = Get-Content -LiteralPath $SourcePath -Raw | ConvertFrom-Json
  $config.browser = [PSCustomObject][ordered]@{
    browserName = 'chromium'
    isolated = $true
    launchOptions = [PSCustomObject][ordered]@{
      executablePath = [IO.Path]::GetFullPath($ChromeExecutablePath)
      headless = $true
      args = @(
        '--enable-automation'
        '--use-gl=angle'
        '--use-angle=swiftshader'
        '--force-color-profile=srgb'
      )
    }
    contextOptions = [PSCustomObject][ordered]@{
      viewport = [PSCustomObject][ordered]@{
        width = 1440
        height = 900
      }
      deviceScaleFactor = $DevicePixelRatio
      colorScheme = 'light'
      reducedMotion = 'reduce'
      locale = 'en-US'
      timezoneId = 'UTC'
    }
  }
  Write-Utf8FileAtomically `
    -Path $DestinationPath `
    -Content "$($config | ConvertTo-Json -Depth 20)$([Environment]::NewLine)"
}
