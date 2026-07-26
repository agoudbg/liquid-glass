import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
  readRepositoryToolchain,
  TOOLCHAIN_PATHS,
} from './legacy-capture-contract.mjs';
import {
  createLegacyToolchainSnapshot,
  verifyLegacyToolchainSnapshot,
} from './legacy-toolchain-snapshot.mjs';

function createFixture(t) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'liquid-glass-snapshot-test-'));
  const repositoryRoot = join(temporaryRoot, 'repository');
  mkdirSync(repositoryRoot);
  for (const protectedPath of TOOLCHAIN_PATHS) {
    const path = resolve(repositoryRoot, ...protectedPath.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `fixture:${protectedPath}\n`, 'utf8');
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
      || !temporaryRoot.includes('liquid-glass-snapshot-test-')
    ) {
      throw new Error('Refusing unsafe snapshot test cleanup.');
    }
    rmSync(temporaryRoot, { recursive: true, force: true });
  });
  return { repositoryRoot, temporaryRoot };
}

test('copies the exact protected tree and verifies its digest', (t) => {
  const { repositoryRoot, temporaryRoot } = createFixture(t);
  const snapshotRoot = join(temporaryRoot, 'snapshot');
  const sourceEvidence = readRepositoryToolchain(repositoryRoot);

  const snapshotEvidence = createLegacyToolchainSnapshot(
    repositoryRoot,
    snapshotRoot,
    sourceEvidence.digest,
  );

  assert.equal(snapshotEvidence.digest, sourceEvidence.digest);
  assert.deepEqual(snapshotEvidence.files, sourceEvidence.files);
  assert.equal(
    verifyLegacyToolchainSnapshot(snapshotRoot, sourceEvidence.digest).digest,
    sourceEvidence.digest,
  );
  for (const protectedPath of TOOLCHAIN_PATHS) {
    assert.equal(
      readFileSync(
        resolve(snapshotRoot, ...protectedPath.split('/')),
        'utf8',
      ),
      `fixture:${protectedPath}\n`,
    );
  }
});

test('rejects a startup digest that does not identify the source', (t) => {
  const { repositoryRoot, temporaryRoot } = createFixture(t);
  const snapshotRoot = join(temporaryRoot, 'snapshot');

  assert.throws(
    () => createLegacyToolchainSnapshot(
      repositoryRoot,
      snapshotRoot,
      '0'.repeat(64),
    ),
    /source before snapshot digest differs/u,
  );
});

test('rejects a snapshot changed after creation', (t) => {
  const { repositoryRoot, temporaryRoot } = createFixture(t);
  const snapshotRoot = join(temporaryRoot, 'snapshot');
  const sourceEvidence = readRepositoryToolchain(repositoryRoot);
  createLegacyToolchainSnapshot(
    repositoryRoot,
    snapshotRoot,
    sourceEvidence.digest,
  );
  const changedPath = resolve(snapshotRoot, ...TOOLCHAIN_PATHS[0].split('/'));
  chmodSync(changedPath, 0o666);
  writeFileSync(changedPath, 'changed\n', 'utf8');

  assert.throws(
    () => verifyLegacyToolchainSnapshot(snapshotRoot, sourceEvidence.digest),
    /snapshot digest differs/u,
  );
});

test('CLI returns the content-addressed snapshot digest', (t) => {
  const { repositoryRoot, temporaryRoot } = createFixture(t);
  const snapshotRoot = join(temporaryRoot, 'snapshot');
  const sourceEvidence = readRepositoryToolchain(repositoryRoot);
  const toolPath = resolve(
    import.meta.dirname,
    'legacy-toolchain-snapshot.mjs',
  );

  const result = spawnSync(process.execPath, [
    toolPath,
    'create',
    repositoryRoot,
    snapshotRoot,
    sourceEvidence.digest,
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${sourceEvidence.digest}\n`);
});
