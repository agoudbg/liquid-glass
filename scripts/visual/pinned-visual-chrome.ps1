$script:PinnedVisualChromeVersion = '150.0.7871.129'
$script:PinnedVisualChromeArchiveSha256 = '4543709a8b323e655b8550d2203468eeeed69cd0fa21e4ae0499f314d53e470d'
$script:PinnedVisualChromeArchiveUrl = (
  'https://storage.googleapis.com/chrome-for-testing-public/' +
  "$script:PinnedVisualChromeVersion/win64/chrome-win64.zip"
)
$script:PinnedVisualChromeDistributionFiles = [ordered]@{
  'chrome.exe' = 'fb14772807d9b4a18d87336fb112fd96fb05b2c80410aab78f74c7030751880e'
  "$script:PinnedVisualChromeVersion/chrome.dll" = 'a063468a67d1681f5163b857fd753694c9c0a3cf0c8349dcadf242efe7019fd7'
  "$script:PinnedVisualChromeVersion/libEGL.dll" = '03f9322c60ab3fccd66b68358c7eda747daa254a1e998fc8a4705c8cc8317075'
  "$script:PinnedVisualChromeVersion/libGLESv2.dll" = '67a86e2d5976cebc6b286fdc68e685b675217f92b95969d2c22ff66785cecfb3'
  "$script:PinnedVisualChromeVersion/vk_swiftshader.dll" = '14056fda2b2ccb3e3afd373b0ab327681f0bb4e2ef408092423e51077c4f89ad'
  "$script:PinnedVisualChromeVersion/vk_swiftshader_icd.json" = '32d83ff113fef532a9f97e0d2831f8656628ab1c99e9060f0332b1532839afd9'
  "$script:PinnedVisualChromeVersion/vulkan-1.dll" = '5a9ef88ca81a11783b780fbe9a5cdd9f136469c76c7c791a540d2991ac193a8f'
}

function Get-PinnedVisualChromeCacheRoot {
  $configuredRoot = $env:LIQUID_GLASS_VISUAL_CHROME_CACHE
  if ($configuredRoot) {
    return [IO.Path]::GetFullPath($configuredRoot)
  }
  if (!$env:LOCALAPPDATA) {
    throw 'LOCALAPPDATA is required to resolve the pinned visual Chrome cache.'
  }
  return [IO.Path]::GetFullPath(
    (Join-Path $env:LOCALAPPDATA 'liquid-glass\visual-chrome')
  )
}

function Assert-PinnedVisualChromeDistribution {
  param(
    [Parameter(Mandatory)] [string]$ChromeExecutablePath
  )

  $resolvedExecutable = [IO.Path]::GetFullPath($ChromeExecutablePath)
  if (!(Test-Path -LiteralPath $resolvedExecutable -PathType Leaf)) {
    throw "Pinned visual Chrome executable was not found: $resolvedExecutable"
  }
  $applicationRoot = [IO.Path]::GetDirectoryName($resolvedExecutable)
  foreach ($entry in $script:PinnedVisualChromeDistributionFiles.GetEnumerator()) {
    $relativePath = $entry.Key.Replace('/', [IO.Path]::DirectorySeparatorChar)
    $filePath = Join-Path $applicationRoot $relativePath
    if (!(Test-Path -LiteralPath $filePath -PathType Leaf)) {
      throw "Pinned visual Chrome distribution file was not found: $filePath"
    }
    $actualHash = (
      Get-FileHash -LiteralPath $filePath -Algorithm SHA256
    ).Hash.ToLowerInvariant()
    if ($actualHash -cne $entry.Value) {
      throw "Pinned visual Chrome distribution file SHA-256 drifted: $filePath"
    }
  }
  $productVersion = (Get-Item -LiteralPath $resolvedExecutable).VersionInfo.ProductVersion
  if ($productVersion -cne $script:PinnedVisualChromeVersion) {
    throw (
      "Pinned visual Chrome version must be " +
      "$script:PinnedVisualChromeVersion, received $productVersion."
    )
  }
  return $resolvedExecutable
}

function Remove-PinnedVisualChromeStagingDirectory {
  param(
    [Parameter(Mandatory)] [string]$CacheRoot,
    [Parameter(Mandatory)] [string]$StagingRoot
  )

  $resolvedCacheRoot = [IO.Path]::GetFullPath($CacheRoot)
  $resolvedStagingRoot = [IO.Path]::GetFullPath($StagingRoot)
  $parent = [IO.Path]::GetDirectoryName($resolvedStagingRoot)
  $leaf = [IO.Path]::GetFileName($resolvedStagingRoot)
  if (
    $parent -cne $resolvedCacheRoot -or
    $leaf -cnotmatch '^\.staging-[a-f0-9]{32}$'
  ) {
    throw "Refusing to remove an unsafe visual Chrome staging path: $resolvedStagingRoot"
  }
  if (Test-Path -LiteralPath $resolvedStagingRoot) {
    Remove-Item -LiteralPath $resolvedStagingRoot -Recurse -Force
  }
}

function Copy-PinnedVisualChromeApplication {
  param(
    [Parameter(Mandatory)] [string]$ExtractedRoot,
    [Parameter(Mandatory)] [string]$ApplicationRoot
  )

  $sourceRoot = Join-Path $ExtractedRoot 'chrome-win64'
  if (!(Test-Path -LiteralPath $sourceRoot -PathType Container)) {
    throw "Chrome for Testing archive is missing chrome-win64: $ExtractedRoot"
  }
  $sourceChrome = Join-Path $sourceRoot 'chrome.exe'
  $sourceProxy = Join-Path $sourceRoot 'chrome_proxy.exe'
  if (
    !(Test-Path -LiteralPath $sourceChrome -PathType Leaf) -or
    !(Test-Path -LiteralPath $sourceProxy -PathType Leaf)
  ) {
    throw 'Chrome for Testing archive is missing its executable files.'
  }

  $versionRoot = Join-Path $ApplicationRoot $script:PinnedVisualChromeVersion
  New-Item -ItemType Directory -Path $ApplicationRoot, $versionRoot | Out-Null
  Copy-Item -LiteralPath $sourceChrome -Destination (
    Join-Path $ApplicationRoot 'chrome.exe'
  )
  Copy-Item -LiteralPath $sourceProxy -Destination (
    Join-Path $ApplicationRoot 'chrome_proxy.exe'
  )
  foreach ($item in Get-ChildItem -LiteralPath $sourceRoot) {
    if ($item.Name -in @('chrome.exe', 'chrome_proxy.exe')) {
      continue
    }
    Copy-Item -LiteralPath $item.FullName -Destination $versionRoot -Recurse
  }
}

function Resolve-PinnedVisualChrome {
  if (
    ![Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
      [Runtime.InteropServices.OSPlatform]::Windows
    )
  ) {
    throw 'The exact visual gate requires the calibrated Windows environment.'
  }

  $configuredExecutable = if ($env:LIQUID_GLASS_VISUAL_CHROME_PATH) {
    $env:LIQUID_GLASS_VISUAL_CHROME_PATH
  } else {
    $env:LIQUID_GLASS_VISUAL_CHROME_EXECUTABLE
  }
  if ($configuredExecutable) {
    return Assert-PinnedVisualChromeDistribution -ChromeExecutablePath (
      [IO.Path]::GetFullPath($configuredExecutable)
    )
  }

  $cacheRoot = Get-PinnedVisualChromeCacheRoot
  $distributionName = (
    "$script:PinnedVisualChromeVersion-" +
    $script:PinnedVisualChromeArchiveSha256.Substring(0, 16)
  )
  $distributionRoot = Join-Path $cacheRoot $distributionName
  $applicationRoot = Join-Path $distributionRoot 'Application'
  $chromeExecutable = Join-Path $applicationRoot 'chrome.exe'
  if (Test-Path -LiteralPath $distributionRoot) {
    try {
      return Assert-PinnedVisualChromeDistribution -ChromeExecutablePath $chromeExecutable
    } catch {
      throw (
        "The pinned visual Chrome cache is invalid at $distributionRoot. " +
        'Remove that exact versioned directory and retry. ' +
        "Cause: $($_.Exception.Message)"
      )
    }
  }

  New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
  $lockPath = Join-Path $cacheRoot '.prepare.lock'
  try {
    $cacheLock = [IO.File]::Open(
      $lockPath,
      [IO.FileMode]::OpenOrCreate,
      [IO.FileAccess]::ReadWrite,
      [IO.FileShare]::None
    )
  } catch [IO.IOException] {
    throw "Another process is preparing pinned visual Chrome under $cacheRoot."
  }

  $stagingRoot = Join-Path $cacheRoot (
    ".staging-$([guid]::NewGuid().ToString('N'))"
  )
  try {
    if (Test-Path -LiteralPath $distributionRoot) {
      return Assert-PinnedVisualChromeDistribution -ChromeExecutablePath $chromeExecutable
    }

    $archivePath = Join-Path $stagingRoot 'chrome-win64.zip'
    $extractedRoot = Join-Path $stagingRoot 'extracted'
    $stagedDistributionRoot = Join-Path $stagingRoot 'distribution'
    $stagedApplicationRoot = Join-Path $stagedDistributionRoot 'Application'
    New-Item -ItemType Directory -Path $stagingRoot, $extractedRoot | Out-Null

    $configuredArchive = $env:LIQUID_GLASS_VISUAL_CHROME_ARCHIVE_PATH
    if ($configuredArchive) {
      $resolvedArchive = [IO.Path]::GetFullPath($configuredArchive)
      if (!(Test-Path -LiteralPath $resolvedArchive -PathType Leaf)) {
        throw "Configured visual Chrome archive was not found: $resolvedArchive"
      }
      Copy-Item -LiteralPath $resolvedArchive -Destination $archivePath
    } else {
      $downloadUrl = if ($env:LIQUID_GLASS_VISUAL_CHROME_DOWNLOAD_URL) {
        $env:LIQUID_GLASS_VISUAL_CHROME_DOWNLOAD_URL
      } else {
        $script:PinnedVisualChromeArchiveUrl
      }
      Write-Host (
        "Downloading Chrome for Testing $script:PinnedVisualChromeVersion " +
        "from $downloadUrl"
      )
      Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath | Out-Null
    }

    $archiveHash = (
      Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
    ).Hash.ToLowerInvariant()
    if ($archiveHash -cne $script:PinnedVisualChromeArchiveSha256) {
      throw (
        'Chrome for Testing archive SHA-256 mismatch. ' +
        "Expected $script:PinnedVisualChromeArchiveSha256, received $archiveHash."
      )
    }

    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractedRoot
    Copy-PinnedVisualChromeApplication `
      -ExtractedRoot $extractedRoot `
      -ApplicationRoot $stagedApplicationRoot
    [void](Assert-PinnedVisualChromeDistribution `
      -ChromeExecutablePath (Join-Path $stagedApplicationRoot 'chrome.exe'))

    $manifest = [ordered]@{
      schemaVersion = 1
      archiveSha256 = $script:PinnedVisualChromeArchiveSha256
      archiveUrl = $script:PinnedVisualChromeArchiveUrl
      browserVersion = $script:PinnedVisualChromeVersion
    } | ConvertTo-Json
    [IO.File]::WriteAllText(
      (Join-Path $stagedDistributionRoot 'manifest.json'),
      "$manifest`n",
      [Text.UTF8Encoding]::new($false)
    )
    Move-Item -LiteralPath $stagedDistributionRoot -Destination $distributionRoot
    return Assert-PinnedVisualChromeDistribution -ChromeExecutablePath $chromeExecutable
  } finally {
    if ($cacheLock) {
      $cacheLock.Dispose()
    }
    Remove-PinnedVisualChromeStagingDirectory `
      -CacheRoot $cacheRoot `
      -StagingRoot $stagingRoot
  }
}
