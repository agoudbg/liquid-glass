$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'legacy-capture-helpers.ps1')
. (Join-Path $PSScriptRoot 'legacy-promotion-transaction.ps1')

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).ProviderPath
$testRoot = Join-Path $repositoryRoot ".legacy-promotion-test-$([guid]::NewGuid().ToString('N'))"
$runId = '20260726-120000-abcdef12'

function New-PromotionFixture {
  param([Parameter(Mandatory)] [string]$Name)

  $parent = Join-Path $testRoot $Name
  $baseline = Join-Path $parent 'legacy'
  New-Item -ItemType Directory -Path $baseline -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $baseline 'value.txt'), 'original')
  $staged = Get-LegacyPromotionTreePath `
    -BaselineParent $parent `
    -PromotionRunId $runId `
    -Role Staged
  New-Item -ItemType Directory -Path $staged | Out-Null
  [IO.File]::WriteAllText((Join-Path $staged 'value.txt'), 'staged')
  return [pscustomobject]@{
    Parent = $parent
    OriginalDigest = Get-DirectoryDigest -Root $baseline
    StagedDigest = Get-DirectoryDigest -Root $staged
  }
}

function Assert-BaselineValue {
  param(
    [Parameter(Mandatory)] [string]$Parent,
    [Parameter(Mandatory)] [string]$Expected
  )

  $actual = Get-Content `
    -LiteralPath (Join-Path $Parent 'legacy\value.txt') `
    -Raw
  if ($actual -cne $Expected) {
    throw "Expected baseline '$Expected', received '$actual'."
  }
}

function Assert-TreeState {
  param(
    [Parameter(Mandatory)] [string]$Parent,
    [Parameter(Mandatory)] [string]$Role,
    [Parameter(Mandatory)] [bool]$Expected
  )

  $actual = Test-LegacyPromotionTree `
    -BaselineParent $Parent `
    -PromotionRunId $runId `
    -Role $Role
  if ($actual -ne $Expected) {
    throw "Expected $Role existence '$Expected', received '$actual'."
  }
}

function Assert-JournalState {
  param(
    [Parameter(Mandatory)] [string]$Parent,
    [Parameter(Mandatory)] [bool]$Expected
  )

  $journalPath = Get-LegacyPromotionJournalPath -BaselineParent $Parent
  if ((Test-Path -LiteralPath $journalPath -PathType Leaf) -ne $Expected) {
    throw "Expected journal existence '$Expected'."
  }
}

function Write-FixtureJournal {
  param(
    [Parameter(Mandatory)] [pscustomobject]$Fixture,
    [Parameter(Mandatory)] [string]$State
  )

  Write-LegacyPromotionJournal `
    -BaselineParent $Fixture.Parent `
    -PromotionRunId $runId `
    -State $State `
    -OriginalDigest $Fixture.OriginalDigest `
    -StagedDigest $Fixture.StagedDigest
}

function Move-FixtureTree {
  param(
    [Parameter(Mandatory)] [pscustomobject]$Fixture,
    [Parameter(Mandatory)] [string]$SourceRole,
    [Parameter(Mandatory)] [string]$DestinationRole
  )

  Move-LegacyPromotionTree `
    -BaselineParent $Fixture.Parent `
    -PromotionRunId $runId `
    -SourceRole $SourceRole `
    -DestinationRole $DestinationRole
}

function Invoke-ExpectedFailure {
  param([Parameter(Mandatory)] [scriptblock]$Action)

  try {
    & $Action
  } catch {
    return $_
  }
  throw "Expected operation to fail."
}

try {
  New-Item -ItemType Directory -Path $testRoot | Out-Null

  $prepared = New-PromotionFixture -Name 'prepared'
  Write-FixtureJournal -Fixture $prepared -State prepared
  Restore-LegacyInterruptedPromotion -BaselineParent $prepared.Parent
  Assert-BaselineValue -Parent $prepared.Parent -Expected original
  Assert-TreeState -Parent $prepared.Parent -Role Staged -Expected $false
  Assert-JournalState -Parent $prepared.Parent -Expected $false

  $originalMoved = New-PromotionFixture -Name 'original-moved'
  Write-FixtureJournal -Fixture $originalMoved -State original-moved
  Move-FixtureTree `
    -Fixture $originalMoved `
    -SourceRole Baseline `
    -DestinationRole Backup
  Restore-LegacyInterruptedPromotion -BaselineParent $originalMoved.Parent
  Assert-BaselineValue -Parent $originalMoved.Parent -Expected original
  Assert-TreeState -Parent $originalMoved.Parent -Role Backup -Expected $false
  Assert-TreeState -Parent $originalMoved.Parent -Role Staged -Expected $false
  Assert-JournalState -Parent $originalMoved.Parent -Expected $false

  $stagePromoted = New-PromotionFixture -Name 'stage-promoted'
  Write-FixtureJournal -Fixture $stagePromoted -State stage-promoted
  Move-FixtureTree `
    -Fixture $stagePromoted `
    -SourceRole Baseline `
    -DestinationRole Backup
  Move-FixtureTree `
    -Fixture $stagePromoted `
    -SourceRole Staged `
    -DestinationRole Baseline
  Restore-LegacyInterruptedPromotion -BaselineParent $stagePromoted.Parent
  Assert-BaselineValue -Parent $stagePromoted.Parent -Expected staged
  Assert-TreeState -Parent $stagePromoted.Parent -Role Backup -Expected $false
  Assert-JournalState -Parent $stagePromoted.Parent -Expected $false

  $unknown = New-PromotionFixture -Name 'unknown-with-valid-backup'
  Write-FixtureJournal -Fixture $unknown -State stage-promoted
  Move-FixtureTree `
    -Fixture $unknown `
    -SourceRole Baseline `
    -DestinationRole Backup
  Move-FixtureTree `
    -Fixture $unknown `
    -SourceRole Staged `
    -DestinationRole Baseline
  [IO.File]::WriteAllText(
    (Join-Path $unknown.Parent 'legacy\value.txt'),
    'unknown'
  )
  Restore-LegacyInterruptedPromotion -BaselineParent $unknown.Parent
  Assert-BaselineValue -Parent $unknown.Parent -Expected original
  Assert-TreeState -Parent $unknown.Parent -Role Quarantine -Expected $true
  $quarantinePath = Get-LegacyPromotionTreePath `
    -BaselineParent $unknown.Parent `
    -PromotionRunId $runId `
    -Role Quarantine
  $quarantinedValue = Get-Content `
    -LiteralPath (Join-Path $quarantinePath 'value.txt') `
    -Raw
  if ($quarantinedValue -cne 'unknown') {
    throw "Unknown baseline was not preserved in quarantine."
  }
  Assert-JournalState -Parent $unknown.Parent -Expected $false

  $corruptBackup = New-PromotionFixture -Name 'corrupt-backup'
  Write-FixtureJournal -Fixture $corruptBackup -State stage-promoted
  Move-FixtureTree `
    -Fixture $corruptBackup `
    -SourceRole Baseline `
    -DestinationRole Backup
  Move-FixtureTree `
    -Fixture $corruptBackup `
    -SourceRole Staged `
    -DestinationRole Baseline
  $corruptBackupPath = Get-LegacyPromotionTreePath `
    -BaselineParent $corruptBackup.Parent `
    -PromotionRunId $runId `
    -Role Backup
  [IO.File]::WriteAllText(
    (Join-Path $corruptBackupPath 'value.txt'),
    'corrupt'
  )
  Invoke-ExpectedFailure {
    Restore-LegacyInterruptedPromotion -BaselineParent $corruptBackup.Parent
  } | Out-Null
  Assert-BaselineValue -Parent $corruptBackup.Parent -Expected staged
  Assert-TreeState -Parent $corruptBackup.Parent -Role Backup -Expected $true
  Assert-JournalState -Parent $corruptBackup.Parent -Expected $true

  $staleStage = New-PromotionFixture -Name 'stale-stage'
  $staleStagePath = Get-LegacyPromotionTreePath `
    -BaselineParent $staleStage.Parent `
    -PromotionRunId $runId `
    -Role Staged
  [IO.File]::WriteAllText(
    (Join-Path $staleStagePath 'value.txt'),
    'changed'
  )
  Invoke-ExpectedFailure {
    Invoke-LegacyBaselinePromotion `
      -BaselineParent $staleStage.Parent `
      -PromotionRunId $runId `
      -ExpectedOriginalDigest $staleStage.OriginalDigest `
      -ExpectedStagedDigest $staleStage.StagedDigest
  } | Out-Null
  Assert-BaselineValue -Parent $staleStage.Parent -Expected original
  Assert-TreeState -Parent $staleStage.Parent -Role Backup -Expected $false
  Assert-JournalState -Parent $staleStage.Parent -Expected $false

  $success = New-PromotionFixture -Name 'successful-promotion'
  Invoke-LegacyBaselinePromotion `
    -BaselineParent $success.Parent `
    -PromotionRunId $runId `
    -ExpectedOriginalDigest $success.OriginalDigest `
    -ExpectedStagedDigest $success.StagedDigest
  Assert-BaselineValue -Parent $success.Parent -Expected staged
  Assert-TreeState -Parent $success.Parent -Role Backup -Expected $false
  Assert-TreeState -Parent $success.Parent -Role Staged -Expected $false
  Assert-JournalState -Parent $success.Parent -Expected $false

  $postMoveDrift = New-PromotionFixture -Name 'post-backup-move-drift'
  $originalMoveTree = (
    Get-Item -LiteralPath Function:Move-LegacyPromotionTree
  ).ScriptBlock
  function Move-LegacyPromotionTree {
    param(
      [string]$BaselineParent,
      [object]$PromotionRunId,
      [string]$SourceRole,
      [string]$DestinationRole
    )

    & $script:originalMoveTree @PSBoundParameters
    if ($SourceRole -eq 'Baseline' -and $DestinationRole -eq 'Backup') {
      $backupPath = Get-LegacyPromotionTreePath `
        -BaselineParent $BaselineParent `
        -PromotionRunId $PromotionRunId `
        -Role Backup
      [IO.File]::WriteAllText(
        (Join-Path $backupPath 'value.txt'),
        'corrupt-after-move'
      )
    }
  }
  try {
    Invoke-ExpectedFailure {
      Invoke-LegacyBaselinePromotion `
        -BaselineParent $postMoveDrift.Parent `
        -PromotionRunId $runId `
        -ExpectedOriginalDigest $postMoveDrift.OriginalDigest `
        -ExpectedStagedDigest $postMoveDrift.StagedDigest
    } | Out-Null
  } finally {
    Set-Item `
      -LiteralPath Function:Move-LegacyPromotionTree `
      -Value $originalMoveTree
  }
  Assert-TreeState `
    -Parent $postMoveDrift.Parent `
    -Role Baseline `
    -Expected $false
  Assert-TreeState -Parent $postMoveDrift.Parent -Role Backup -Expected $true
  Assert-TreeState -Parent $postMoveDrift.Parent -Role Staged -Expected $true
  Assert-JournalState -Parent $postMoveDrift.Parent -Expected $true

  $preDeleteDrift = New-PromotionFixture -Name 'pre-backup-delete-drift'
  $originalWriteJournal = (
    Get-Item -LiteralPath Function:Write-LegacyPromotionJournal
  ).ScriptBlock
  function Write-LegacyPromotionJournal {
    param(
      [string]$BaselineParent,
      [object]$PromotionRunId,
      [string]$State,
      [object]$OriginalDigest,
      [object]$StagedDigest
    )

    & $script:originalWriteJournal @PSBoundParameters
    if ($State -eq 'stage-promoted') {
      $backupPath = Get-LegacyPromotionTreePath `
        -BaselineParent $BaselineParent `
        -PromotionRunId $PromotionRunId `
        -Role Backup
      [IO.File]::WriteAllText(
        (Join-Path $backupPath 'value.txt'),
        'corrupt-before-delete'
      )
    }
  }
  try {
    Invoke-ExpectedFailure {
      Invoke-LegacyBaselinePromotion `
        -BaselineParent $preDeleteDrift.Parent `
        -PromotionRunId $runId `
        -ExpectedOriginalDigest $preDeleteDrift.OriginalDigest `
        -ExpectedStagedDigest $preDeleteDrift.StagedDigest
    } | Out-Null
  } finally {
    Set-Item `
      -LiteralPath Function:Write-LegacyPromotionJournal `
      -Value $originalWriteJournal
  }
  Assert-BaselineValue -Parent $preDeleteDrift.Parent -Expected staged
  Assert-TreeState -Parent $preDeleteDrift.Parent -Role Backup -Expected $true
  Assert-JournalState -Parent $preDeleteDrift.Parent -Expected $true

  $rollback = New-PromotionFixture -Name 'rollback-final-digest'
  $originalWriteJournal = (
    Get-Item -LiteralPath Function:Write-LegacyPromotionJournal
  ).ScriptBlock
  $originalMoveTree = (
    Get-Item -LiteralPath Function:Move-LegacyPromotionTree
  ).ScriptBlock
  function Write-LegacyPromotionJournal {
    param(
      [string]$BaselineParent,
      [object]$PromotionRunId,
      [string]$State,
      [object]$OriginalDigest,
      [object]$StagedDigest
    )

    if ($State -eq 'stage-promoted') {
      throw "Injected stage-promoted journal failure."
    }
    & $script:originalWriteJournal @PSBoundParameters
  }
  function Move-LegacyPromotionTree {
    param(
      [string]$BaselineParent,
      [object]$PromotionRunId,
      [string]$SourceRole,
      [string]$DestinationRole
    )

    & $script:originalMoveTree @PSBoundParameters
    if ($SourceRole -eq 'Backup' -and $DestinationRole -eq 'Baseline') {
      [IO.File]::WriteAllText(
        (Join-Path $BaselineParent 'legacy\value.txt'),
        'corrupt-after-restore'
      )
    }
  }
  try {
    Invoke-ExpectedFailure {
      Invoke-LegacyBaselinePromotion `
        -BaselineParent $rollback.Parent `
        -PromotionRunId $runId `
        -ExpectedOriginalDigest $rollback.OriginalDigest `
        -ExpectedStagedDigest $rollback.StagedDigest
    } | Out-Null
  } finally {
    Set-Item `
      -LiteralPath Function:Write-LegacyPromotionJournal `
      -Value $originalWriteJournal
    Set-Item `
      -LiteralPath Function:Move-LegacyPromotionTree `
      -Value $originalMoveTree
  }
  Assert-BaselineValue `
    -Parent $rollback.Parent `
    -Expected 'corrupt-after-restore'
  Assert-TreeState -Parent $rollback.Parent -Role Staged -Expected $true
  Assert-JournalState -Parent $rollback.Parent -Expected $true

  Write-Output 'Legacy promotion transaction tests passed.'
} finally {
  if (Test-Path -LiteralPath $testRoot -PathType Container) {
    $canonicalRepository = Resolve-CanonicalExistingPath -Path $repositoryRoot
    $canonicalTestRoot = Resolve-CanonicalExistingPath -Path $testRoot
    $testLeaf = [IO.Path]::GetFileName($canonicalTestRoot)
    if (
      ![StringComparer]::OrdinalIgnoreCase.Equals(
        [IO.Path]::GetDirectoryName($canonicalTestRoot),
        $canonicalRepository
      ) `
      -or $testLeaf -cnotmatch '^\.legacy-promotion-test-[a-f0-9]{32}$'
    ) {
      throw "Refusing unsafe transaction test cleanup: '$canonicalTestRoot'."
    }
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}
