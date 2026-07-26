function Assert-LegacyCaptureRunId {
  param([Parameter(Mandatory)] [AllowEmptyString()] [object]$Value)

  if (
    $Value -isnot [string] `
    -or $Value -cnotmatch '^\d{8}-\d{6}-[a-f0-9]{8}$'
  ) {
    throw "Legacy capture runId has an invalid format."
  }
  return $Value
}

function Get-LegacyPromotionTreePath {
  param(
    [Parameter(Mandatory)] [string]$BaselineParent,
    [Parameter(Mandatory)] [object]$PromotionRunId,
    [Parameter(Mandatory)]
    [ValidateSet('Baseline', 'Staged', 'Backup', 'Quarantine')]
    [string]$Role
  )

  $validatedRunId = Assert-LegacyCaptureRunId -Value $PromotionRunId
  $leaf = switch ($Role) {
    'Baseline' { 'legacy' }
    'Staged' { ".legacy-stage-$validatedRunId" }
    'Backup' { ".legacy-backup-$validatedRunId" }
    'Quarantine' { ".legacy-quarantine-$validatedRunId" }
  }
  $pattern = switch ($Role) {
    'Baseline' { '^legacy$' }
    'Staged' { "^\.legacy-stage-$([regex]::Escape($validatedRunId))$" }
    'Backup' { "^\.legacy-backup-$([regex]::Escape($validatedRunId))$" }
    'Quarantine' { "^\.legacy-quarantine-$([regex]::Escape($validatedRunId))$" }
  }
  return Resolve-SafeDirectChildPath `
    -ParentRoot $BaselineParent `
    -CandidatePath (Join-Path $BaselineParent $leaf) `
    -LeafPattern $pattern `
    -ExistingType Container
}

function Get-LegacyPromotionJournalPath {
  param([Parameter(Mandatory)] [string]$BaselineParent)

  return Resolve-SafeDirectChildPath `
    -ParentRoot $BaselineParent `
    -CandidatePath (Join-Path $BaselineParent '.legacy-promotion.json') `
    -LeafPattern '^\.legacy-promotion\.json$' `
    -ExistingType Leaf
}

function Test-LegacyPromotionTree {
  param(
    [Parameter(Mandatory)] [string]$BaselineParent,
    [Parameter(Mandatory)] [object]$PromotionRunId,
    [Parameter(Mandatory)]
    [ValidateSet('Baseline', 'Staged', 'Backup', 'Quarantine')]
    [string]$Role
  )

  $path = Get-LegacyPromotionTreePath @PSBoundParameters
  return Test-Path -LiteralPath $path -PathType Container
}

function Remove-LegacyPromotionTree {
  param(
    [Parameter(Mandatory)] [string]$BaselineParent,
    [Parameter(Mandatory)] [object]$PromotionRunId,
    [Parameter(Mandatory)]
    [ValidateSet('Baseline', 'Staged', 'Backup', 'Quarantine')]
    [string]$Role
  )

  $path = Get-LegacyPromotionTreePath @PSBoundParameters
  if (Test-Path -LiteralPath $path -PathType Container) {
    Remove-Item -LiteralPath $path -Recurse -Force
  }
}

function Move-LegacyPromotionTree {
  param(
    [Parameter(Mandatory)] [string]$BaselineParent,
    [Parameter(Mandatory)] [object]$PromotionRunId,
    [Parameter(Mandatory)]
    [ValidateSet('Baseline', 'Staged', 'Backup', 'Quarantine')]
    [string]$SourceRole,
    [Parameter(Mandatory)]
    [ValidateSet('Baseline', 'Staged', 'Backup', 'Quarantine')]
    [string]$DestinationRole
  )

  $source = Get-LegacyPromotionTreePath `
    -BaselineParent $BaselineParent `
    -PromotionRunId $PromotionRunId `
    -Role $SourceRole
  $destination = Get-LegacyPromotionTreePath `
    -BaselineParent $BaselineParent `
    -PromotionRunId $PromotionRunId `
    -Role $DestinationRole
  if (!(Test-Path -LiteralPath $source -PathType Container)) {
    throw "Cannot move missing promotion source: '$source'."
  }
  if (Test-Path -LiteralPath $destination) {
    throw "Refusing to overwrite promotion destination: '$destination'."
  }
  Move-Item -LiteralPath $source -Destination $destination
}

function Remove-LegacyPromotionJournal {
  param([Parameter(Mandatory)] [string]$BaselineParent)

  $journalPath = Get-LegacyPromotionJournalPath -BaselineParent $BaselineParent
  if (Test-Path -LiteralPath $journalPath -PathType Leaf) {
    Remove-Item -LiteralPath $journalPath -Force
  }
}

function Write-LegacyPromotionJournal {
  param(
    [Parameter(Mandatory)] [string]$BaselineParent,
    [Parameter(Mandatory)] [object]$PromotionRunId,
    [Parameter(Mandatory)]
    [ValidateSet('prepared', 'original-moved', 'stage-promoted')]
    [string]$State,
    [Parameter(Mandatory)] [object]$OriginalDigest,
    [Parameter(Mandatory)] [object]$StagedDigest
  )

  $validatedRunId = Assert-LegacyCaptureRunId -Value $PromotionRunId
  $validatedOriginalDigest = Assert-LowercaseSha256 `
    -Value $OriginalDigest `
    -Label 'Original baseline digest'
  $validatedStagedDigest = Assert-LowercaseSha256 `
    -Value $StagedDigest `
    -Label 'Staged baseline digest'
  $journal = [ordered]@{
    runId = $validatedRunId
    state = $State
    originalDigest = $validatedOriginalDigest
    stagedDigest = $validatedStagedDigest
  } | ConvertTo-Json -Compress
  $journalPath = Get-LegacyPromotionJournalPath -BaselineParent $BaselineParent
  Write-Utf8FileAtomically `
    -Path $journalPath `
    -Content "$journal$([Environment]::NewLine)"
}

function Restore-LegacyInterruptedPromotion {
  param([Parameter(Mandatory)] [string]$BaselineParent)

  $journalPath = Get-LegacyPromotionJournalPath -BaselineParent $BaselineParent
  if (!(Test-Path -LiteralPath $journalPath -PathType Leaf)) { return }

  $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
  $expectedProperties = @('originalDigest', 'runId', 'stagedDigest', 'state')
  $actualProperties = @($journal.PSObject.Properties.Name | Sort-Object)
  if (
    ($actualProperties -join "`n") -cne ($expectedProperties -join "`n") `
    -or $journal.state -isnot [string] `
    -or $journal.state -cnotin @(
      'prepared',
      'original-moved',
      'stage-promoted'
    )
  ) {
    throw "Refusing to recover an invalid legacy baseline promotion journal."
  }
  $journalRunId = Assert-LegacyCaptureRunId -Value $journal.runId
  $originalDigest = Assert-LowercaseSha256 `
    -Value $journal.originalDigest `
    -Label 'Promotion journal original digest'
  $stagedDigest = Assert-LowercaseSha256 `
    -Value $journal.stagedDigest `
    -Label 'Promotion journal staged digest'

  $baselineExists = Test-LegacyPromotionTree `
    -BaselineParent $BaselineParent `
    -PromotionRunId $journalRunId `
    -Role Baseline
  $backupExists = Test-LegacyPromotionTree `
    -BaselineParent $BaselineParent `
    -PromotionRunId $journalRunId `
    -Role Backup
  $stagedExists = Test-LegacyPromotionTree `
    -BaselineParent $BaselineParent `
    -PromotionRunId $journalRunId `
    -Role Staged
  $backupDigest = if ($backupExists) {
    $backupPath = Get-LegacyPromotionTreePath `
      -BaselineParent $BaselineParent `
      -PromotionRunId $journalRunId `
      -Role Backup
    Get-DirectoryDigest -Root $backupPath
  } else {
    $null
  }

  if (!$baselineExists -and $backupExists) {
    if ($backupDigest -cne $originalDigest) {
      throw "Legacy baseline promotion recovery found a corrupt original backup."
    }
    Move-LegacyPromotionTree `
      -BaselineParent $BaselineParent `
      -PromotionRunId $journalRunId `
      -SourceRole Backup `
      -DestinationRole Baseline
    $baselineExists = $true
    $backupExists = $false
  }
  if (!$baselineExists) {
    throw "Legacy baseline promotion recovery found neither a current nor backup baseline."
  }

  $baselinePath = Get-LegacyPromotionTreePath `
    -BaselineParent $BaselineParent `
    -PromotionRunId $journalRunId `
    -Role Baseline
  $currentDigest = Get-DirectoryDigest -Root $baselinePath
  if ($currentDigest -ceq $stagedDigest) {
    if ($backupExists) {
      if ($backupDigest -cne $originalDigest) {
        throw "Legacy baseline promotion recovery found a corrupt original backup."
      }
      Remove-LegacyPromotionTree `
        -BaselineParent $BaselineParent `
        -PromotionRunId $journalRunId `
        -Role Backup
    }
  } elseif ($currentDigest -ceq $originalDigest) {
    if ($backupExists) {
      if ($backupDigest -cne $originalDigest) {
        throw "Legacy baseline promotion recovery found a corrupt original backup."
      }
      Remove-LegacyPromotionTree `
        -BaselineParent $BaselineParent `
        -PromotionRunId $journalRunId `
        -Role Backup
    }
    if ($stagedExists) {
      $stagedPath = Get-LegacyPromotionTreePath `
        -BaselineParent $BaselineParent `
        -PromotionRunId $journalRunId `
        -Role Staged
      if ((Get-DirectoryDigest -Root $stagedPath) -cne $stagedDigest) {
        throw "Legacy baseline promotion recovery found corrupt staged evidence."
      }
      Remove-LegacyPromotionTree `
        -BaselineParent $BaselineParent `
        -PromotionRunId $journalRunId `
        -Role Staged
    }
  } else {
    if (!$backupExists -or $backupDigest -cne $originalDigest) {
      throw "Legacy baseline promotion recovery cannot replace an unknown baseline without a verified original backup."
    }
    if (
      Test-LegacyPromotionTree `
        -BaselineParent $BaselineParent `
        -PromotionRunId $journalRunId `
        -Role Quarantine
    ) {
      throw "Legacy baseline promotion recovery found an occupied quarantine path."
    }
    Move-LegacyPromotionTree `
      -BaselineParent $BaselineParent `
      -PromotionRunId $journalRunId `
      -SourceRole Baseline `
      -DestinationRole Quarantine
    Move-LegacyPromotionTree `
      -BaselineParent $BaselineParent `
      -PromotionRunId $journalRunId `
      -SourceRole Backup `
      -DestinationRole Baseline
    $restoredBaselinePath = Get-LegacyPromotionTreePath `
      -BaselineParent $BaselineParent `
      -PromotionRunId $journalRunId `
      -Role Baseline
    if ((Get-DirectoryDigest -Root $restoredBaselinePath) -cne $originalDigest) {
      throw "Restored original baseline failed its final digest verification."
    }
  }
  if ((Get-DirectoryDigest -Root $baselinePath) -notin @(
    $originalDigest,
    $stagedDigest
  )) {
    throw "Recovered baseline failed its final digest verification."
  }
  Remove-LegacyPromotionJournal -BaselineParent $BaselineParent
}

function Invoke-LegacyBaselinePromotion {
  param(
    [Parameter(Mandatory)] [string]$BaselineParent,
    [Parameter(Mandatory)] [object]$PromotionRunId,
    [Parameter(Mandatory)] [object]$ExpectedOriginalDigest,
    [Parameter(Mandatory)] [object]$ExpectedStagedDigest
  )

  $validatedRunId = Assert-LegacyCaptureRunId -Value $PromotionRunId
  $originalDigest = Assert-LowercaseSha256 `
    -Value $ExpectedOriginalDigest `
    -Label 'Expected original baseline digest'
  $stagedDigest = Assert-LowercaseSha256 `
    -Value $ExpectedStagedDigest `
    -Label 'Expected staged baseline digest'
  $baselinePath = Get-LegacyPromotionTreePath `
    -BaselineParent $BaselineParent `
    -PromotionRunId $validatedRunId `
    -Role Baseline
  if ((Get-DirectoryDigest -Root $baselinePath) -cne $originalDigest) {
    throw "Committed legacy baselines changed before promotion."
  }
  $stagedPath = Get-LegacyPromotionTreePath `
    -BaselineParent $BaselineParent `
    -PromotionRunId $validatedRunId `
    -Role Staged
  if ((Get-DirectoryDigest -Root $stagedPath) -cne $stagedDigest) {
    throw "Staged legacy baselines changed before promotion."
  }

  Write-LegacyPromotionJournal `
    -BaselineParent $BaselineParent `
    -PromotionRunId $validatedRunId `
    -State prepared `
    -OriginalDigest $originalDigest `
    -StagedDigest $stagedDigest
  try {
    Move-LegacyPromotionTree `
      -BaselineParent $BaselineParent `
      -PromotionRunId $validatedRunId `
      -SourceRole Baseline `
      -DestinationRole Backup
    $promotedBackupPath = Get-LegacyPromotionTreePath `
      -BaselineParent $BaselineParent `
      -PromotionRunId $validatedRunId `
      -Role Backup
    if ((Get-DirectoryDigest -Root $promotedBackupPath) -cne $originalDigest) {
      throw "Original backup changed immediately after promotion move."
    }
    Write-LegacyPromotionJournal `
      -BaselineParent $BaselineParent `
      -PromotionRunId $validatedRunId `
      -State original-moved `
      -OriginalDigest $originalDigest `
      -StagedDigest $stagedDigest
    Move-LegacyPromotionTree `
      -BaselineParent $BaselineParent `
      -PromotionRunId $validatedRunId `
      -SourceRole Staged `
      -DestinationRole Baseline
    Write-LegacyPromotionJournal `
      -BaselineParent $BaselineParent `
      -PromotionRunId $validatedRunId `
      -State stage-promoted `
      -OriginalDigest $originalDigest `
      -StagedDigest $stagedDigest
    $promotedBaselinePath = Get-LegacyPromotionTreePath `
      -BaselineParent $BaselineParent `
      -PromotionRunId $validatedRunId `
      -Role Baseline
    if ((Get-DirectoryDigest -Root $promotedBaselinePath) -cne $stagedDigest) {
      throw "Promoted legacy baseline digest differs from its validated staging digest."
    }
    if ((Get-DirectoryDigest -Root $promotedBackupPath) -cne $originalDigest) {
      throw "Original backup changed before promotion cleanup."
    }
    Remove-LegacyPromotionTree `
      -BaselineParent $BaselineParent `
      -PromotionRunId $validatedRunId `
      -Role Backup
    Remove-LegacyPromotionJournal -BaselineParent $BaselineParent
  } catch {
    $promotionFailure = $_
    try {
      $baselineExists = Test-LegacyPromotionTree `
        -BaselineParent $BaselineParent `
        -PromotionRunId $validatedRunId `
        -Role Baseline
      $backupExists = Test-LegacyPromotionTree `
        -BaselineParent $BaselineParent `
        -PromotionRunId $validatedRunId `
        -Role Backup
      if ($backupExists) {
        $backupPath = Get-LegacyPromotionTreePath `
          -BaselineParent $BaselineParent `
          -PromotionRunId $validatedRunId `
          -Role Backup
        if ((Get-DirectoryDigest -Root $backupPath) -cne $originalDigest) {
          throw "Automatic rollback found a corrupt original backup."
        }

        if ($baselineExists) {
          $currentBaselinePath = Get-LegacyPromotionTreePath `
            -BaselineParent $BaselineParent `
            -PromotionRunId $validatedRunId `
            -Role Baseline
          if (
            (Get-DirectoryDigest -Root $currentBaselinePath) `
              -cne $originalDigest
          ) {
            $evidenceRole = if (
              !(Test-LegacyPromotionTree `
                -BaselineParent $BaselineParent `
                -PromotionRunId $validatedRunId `
                -Role Staged)
            ) {
              'Staged'
            } elseif (
              !(Test-LegacyPromotionTree `
                -BaselineParent $BaselineParent `
                -PromotionRunId $validatedRunId `
                -Role Quarantine)
            ) {
              'Quarantine'
            } else {
              throw "Automatic rollback has no safe path for failed baseline evidence."
            }
            Move-LegacyPromotionTree `
              -BaselineParent $BaselineParent `
              -PromotionRunId $validatedRunId `
              -SourceRole Baseline `
              -DestinationRole $evidenceRole
            $baselineExists = $false
          }
        }
        if (!$baselineExists) {
          if ((Get-DirectoryDigest -Root $backupPath) -cne $originalDigest) {
            throw "Original backup changed during automatic rollback."
          }
          Move-LegacyPromotionTree `
            -BaselineParent $BaselineParent `
            -PromotionRunId $validatedRunId `
            -SourceRole Backup `
            -DestinationRole Baseline
        }
        $restoredBaselinePath = Get-LegacyPromotionTreePath `
          -BaselineParent $BaselineParent `
          -PromotionRunId $validatedRunId `
          -Role Baseline
        if (
          (Get-DirectoryDigest -Root $restoredBaselinePath) `
            -cne $originalDigest
        ) {
          throw "Automatic rollback failed its final original digest verification."
        }
        if (
          Test-LegacyPromotionTree `
            -BaselineParent $BaselineParent `
            -PromotionRunId $validatedRunId `
            -Role Backup
        ) {
          Remove-LegacyPromotionTree `
            -BaselineParent $BaselineParent `
            -PromotionRunId $validatedRunId `
            -Role Backup
        }
        Remove-LegacyPromotionJournal -BaselineParent $BaselineParent
      } elseif ($baselineExists) {
        $currentBaselinePath = Get-LegacyPromotionTreePath `
          -BaselineParent $BaselineParent `
          -PromotionRunId $validatedRunId `
          -Role Baseline
        $currentDigest = Get-DirectoryDigest -Root $currentBaselinePath
        if ($currentDigest -notin @($originalDigest, $stagedDigest)) {
          throw "Automatic rollback found an unknown baseline without a backup."
        }
        Remove-LegacyPromotionJournal -BaselineParent $BaselineParent
      } else {
        throw "Automatic rollback found neither a baseline nor an original backup."
      }
    } catch {
      throw "Legacy baseline promotion failed and automatic rollback could not verify the original baseline. Promotion: $($promotionFailure.Exception.Message) Rollback: $($_.Exception.Message)"
    }
    throw $promotionFailure
  }
}
