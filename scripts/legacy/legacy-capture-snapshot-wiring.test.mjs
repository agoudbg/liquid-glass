import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const captureScript = readFileSync(
  resolve(import.meta.dirname, 'capture-legacy-oracle.ps1'),
  'utf8',
).replaceAll('\r\n', '\n');

test('publishable capture executes every protected stage from its snapshot', () => {
  const requiredSnippets = [
    "$worktreeSnapshotToolPath,\n        'create',",
    '$toolchainSnapshotLease = Open-TrustedToolchainSnapshotLease',
    "$trustedToolchainRoot 'tests\\legacy-oracle\\harness\\OracleApp.vue'",
    '$trustedToolchainRoot "tests\\legacy-oracle\\config\\dpr-$dpr.json"',
    "$probePath = Join-Path $ToolchainRoot 'tests\\legacy-oracle\\capture-contract-probe.js'",
    '$capturePath = Join-Path $trustedToolchainRoot "tests\\legacy-oracle\\$captureFile"',
    "$trustedToolchainRoot 'scripts\\legacy\\analyze-legacy-oracle.mjs'",
    '$trustedToolchainRoot,\n      $calibrationRoot,',
    "$captureContractToolPath,\n      'create',\n      $trustedToolchainRoot,",
  ];
  for (const snippet of requiredSnippets) {
    assert.ok(
      captureScript.includes(snippet),
      `Missing trusted snapshot wiring: ${snippet}`,
    );
  }

  assert.ok(
    captureScript.indexOf("'create',\n        $repositoryRoot,")
      < captureScript.indexOf("'tests\\legacy-oracle\\harness\\OracleApp.vue'"),
    'The toolchain snapshot must exist before protected harness files are read.',
  );
  assert.ok(
    !captureScript.includes(
      '$capturePath = Join-Path $repositoryRoot "tests\\legacy-oracle\\$captureFile"',
    ),
    'Capture run code must not execute from the mutable worktree.',
  );
  assert.ok(
    !captureScript.includes(
      "$repositoryRoot 'scripts\\legacy\\analyze-legacy-oracle.mjs'",
    ),
    'The analyzer must not execute from the mutable worktree.',
  );
});

test('final verification uses snapshot code against fresh worktree evidence', () => {
  assert.ok(
    (captureScript.match(/Assert-PublishableToolchain/gu) ?? []).length >= 12,
    'Every protected capture stage must be surrounded by in-memory verification.',
  );
  assert.ok(
    captureScript.includes(
      '-ToolchainRoot $trustedToolchainRoot `\n      -ProbeConfigPath $probeConfigPath',
    ),
    'The final environment probe must execute trusted snapshot code.',
  );
  assert.ok(
    captureScript.includes(
      "$captureContractToolPath,\n        'verify-current-environment',\n        $repositoryRoot,",
    ),
    'The trusted contract tool must verify the current worktree before promotion.',
  );
});
