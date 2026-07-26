import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import test from 'node:test';

import {
  readPlaywrightCliRuntimeEvidence,
  readPlaywrightTestRuntimeEvidence,
} from './legacy-playwright-runtime.mjs';

function createRuntimeFixture(t) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'playwright-runtime-test-'));
  const nodeModulesRoot = join(temporaryRoot, 'node_modules');
  const cliRoot = join(nodeModulesRoot, '@playwright', 'cli');
  const testRoot = join(nodeModulesRoot, '@playwright', 'test');
  const coreRoot = join(nodeModulesRoot, 'playwright-core');
  const playwrightRoot = join(nodeModulesRoot, 'playwright');
  const launcherPath = join(temporaryRoot, 'playwright-cli.ps1');
  const files = new Map([
    [join(cliRoot, 'package.json'), JSON.stringify({
      name: '@playwright/cli',
      version: '0.1.17',
    })],
    [join(cliRoot, 'index.js'), 'export {};\n'],
    [join(cliRoot, 'assets', 'runtime.txt'), 'runtime\n'],
    [join(testRoot, 'package.json'), JSON.stringify({
      name: '@playwright/test',
      version: '1.62.0-alpha-test',
    })],
    [join(testRoot, 'index.js'), 'export const test = true;\n'],
    [join(coreRoot, 'package.json'), JSON.stringify({
      name: 'playwright-core',
      version: '1.62.0-alpha-test',
    })],
    [join(coreRoot, 'index.js'), 'export const core = true;\n'],
    [join(playwrightRoot, 'package.json'), JSON.stringify({
      name: 'playwright',
      version: '1.62.0-alpha-test',
    })],
    [join(playwrightRoot, 'index.js'), 'export const playwright = true;\n'],
    [launcherPath, '& node playwright-cli.js $args\n'],
  ]);
  for (const [path, content] of files) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
  }
  t.after(() => {
    const cleanupRelativePath = relative(
      resolve(tmpdir()),
      resolve(temporaryRoot),
    );
    if (
      cleanupRelativePath === ''
      || cleanupRelativePath === '..'
      || cleanupRelativePath.startsWith('../')
      || cleanupRelativePath.startsWith('..\\')
      || isAbsolute(cleanupRelativePath)
      || !temporaryRoot.includes('playwright-runtime-test-')
    ) {
      throw new Error('Refusing unsafe Playwright runtime test cleanup.');
    }
    rmSync(temporaryRoot, { recursive: true, force: true });
  });
  return {
    cliRoot,
    coreRoot,
    launcherPath,
    playwrightRoot,
    temporaryRoot,
    testRoot,
  };
}

test('returns deterministic CLI, launcher, and shared runtime identity', (t) => {
  const { launcherPath, temporaryRoot } = createRuntimeFixture(t);

  const first = readPlaywrightCliRuntimeEvidence(
    temporaryRoot,
    launcherPath,
  );
  const second = readPlaywrightCliRuntimeEvidence(
    temporaryRoot,
    launcherPath,
  );

  assert.deepEqual(first, second);
  assert.deepEqual(
    {
      playwrightCliVersion: first.playwrightCliVersion,
      playwrightCoreVersion: first.playwrightCoreVersion,
    },
    {
      playwrightCliVersion: '0.1.17',
      playwrightCoreVersion: '1.62.0-alpha-test',
    },
  );
  for (const digest of [
    first.playwrightCliLauncherDigest,
    first.playwrightCliPackageDigest,
    first.playwrightRuntimePackageDigest,
  ]) {
    assert.match(digest, /^[a-f0-9]{64}$/u);
  }
});

test('shares the runtime digest with the candidate package chain', (t) => {
  const { launcherPath, temporaryRoot } = createRuntimeFixture(t);
  const capture = readPlaywrightCliRuntimeEvidence(
    temporaryRoot,
    launcherPath,
  );
  const candidate = readPlaywrightTestRuntimeEvidence(temporaryRoot);

  assert.equal(
    candidate.playwrightRuntimePackageDigest,
    capture.playwrightRuntimePackageDigest,
  );
  assert.equal(candidate.playwrightTestVersion, capture.playwrightCoreVersion);
  assert.match(candidate.playwrightTestPackageDigest, /^[a-f0-9]{64}$/u);
});

test('changes the shared digest when installed core bytes change', (t) => {
  const { coreRoot, launcherPath, temporaryRoot } = createRuntimeFixture(t);
  const captureBefore = readPlaywrightCliRuntimeEvidence(
    temporaryRoot,
    launcherPath,
  );
  const candidateBefore = readPlaywrightTestRuntimeEvidence(temporaryRoot);
  writeFileSync(
    join(coreRoot, 'index.js'),
    'export const changedCore = true;\n',
  );
  const captureAfter = readPlaywrightCliRuntimeEvidence(
    temporaryRoot,
    launcherPath,
  );
  const candidateAfter = readPlaywrightTestRuntimeEvidence(temporaryRoot);

  assert.notEqual(
    captureBefore.playwrightRuntimePackageDigest,
    captureAfter.playwrightRuntimePackageDigest,
  );
  assert.equal(
    candidateAfter.playwrightRuntimePackageDigest,
    captureAfter.playwrightRuntimePackageDigest,
  );
  assert.notEqual(
    candidateBefore.playwrightRuntimePackageDigest,
    candidateAfter.playwrightRuntimePackageDigest,
  );
});

test('isolates CLI package and launcher byte drift from shared runtime', (t) => {
  const {
    cliRoot,
    launcherPath,
    temporaryRoot,
  } = createRuntimeFixture(t);
  const before = readPlaywrightCliRuntimeEvidence(
    temporaryRoot,
    launcherPath,
  );
  writeFileSync(join(cliRoot, 'index.js'), 'export const changed = true;\n');
  const packageDrift = readPlaywrightCliRuntimeEvidence(
    temporaryRoot,
    launcherPath,
  );
  writeFileSync(launcherPath, '& node changed-launcher.js $args\n');
  const launcherDrift = readPlaywrightCliRuntimeEvidence(
    temporaryRoot,
    launcherPath,
  );

  assert.notEqual(
    before.playwrightCliPackageDigest,
    packageDrift.playwrightCliPackageDigest,
  );
  assert.equal(
    before.playwrightRuntimePackageDigest,
    packageDrift.playwrightRuntimePackageDigest,
  );
  assert.notEqual(
    packageDrift.playwrightCliLauncherDigest,
    launcherDrift.playwrightCliLauncherDigest,
  );
  assert.equal(
    packageDrift.playwrightRuntimePackageDigest,
    launcherDrift.playwrightRuntimePackageDigest,
  );
});

test('hashes candidate facade bytes without changing shared runtime', (t) => {
  const { temporaryRoot, testRoot } = createRuntimeFixture(t);
  const before = readPlaywrightTestRuntimeEvidence(temporaryRoot);
  writeFileSync(join(testRoot, 'index.js'), 'export const changed = true;\n');
  const after = readPlaywrightTestRuntimeEvidence(temporaryRoot);

  assert.notEqual(
    before.playwrightTestPackageDigest,
    after.playwrightTestPackageDigest,
  );
  assert.equal(
    before.playwrightRuntimePackageDigest,
    after.playwrightRuntimePackageDigest,
  );
});

test('rejects mismatched Playwright package versions', (t) => {
  const { temporaryRoot } = createRuntimeFixture(t);
  writeFileSync(
    join(temporaryRoot, 'node_modules', 'playwright', 'package.json'),
    JSON.stringify({ name: 'playwright', version: '1.61.1' }),
  );

  assert.throws(
    () => readPlaywrightTestRuntimeEvidence(temporaryRoot),
    /Playwright and playwright-core package versions differ/u,
  );
});
