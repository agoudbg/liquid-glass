import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
} from 'node:fs';
import { platform } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readRepositoryToolchain,
  TOOLCHAIN_PATHS,
} from './legacy-capture-contract.mjs';

const SHA_256_PATTERN = /^[a-f0-9]{64}$/u;

function requireSha256(value, label) {
  if (typeof value !== 'string' || !SHA_256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256.`);
  }
  return value;
}

function comparablePath(path) {
  const absolutePath = resolve(path);
  return platform() === 'win32' ? absolutePath.toLowerCase() : absolutePath;
}

function isContainedPath(root, candidate) {
  const childPath = relative(root, candidate);
  return (
    childPath.length > 0
    && childPath !== '..'
    && !childPath.startsWith(`..${sep}`)
    && !isAbsolute(childPath)
  );
}

function resolveSourceRoot(repositoryRoot) {
  if (!existsSync(repositoryRoot)) {
    throw new Error('Toolchain snapshot source root does not exist.');
  }
  return realpathSync.native(repositoryRoot);
}

function resolveSnapshotRoot(sourceRoot, snapshotRoot) {
  const absoluteSnapshotRoot = resolve(snapshotRoot);
  if (existsSync(absoluteSnapshotRoot)) {
    throw new Error('Toolchain snapshot destination must not already exist.');
  }
  const parentRoot = realpathSync.native(dirname(absoluteSnapshotRoot));
  const resolvedSnapshotRoot = resolve(parentRoot, basename(absoluteSnapshotRoot));
  if (
    comparablePath(resolvedSnapshotRoot) === comparablePath(sourceRoot)
    || isContainedPath(sourceRoot, resolvedSnapshotRoot)
    || isContainedPath(resolvedSnapshotRoot, sourceRoot)
  ) {
    throw new Error('Toolchain snapshot source and destination must be disjoint.');
  }
  return resolvedSnapshotRoot;
}

function resolveProtectedSourceFile(sourceRoot, protectedPath) {
  const candidatePath = resolve(sourceRoot, ...protectedPath.split('/'));
  const file = lstatSync(candidatePath);
  if (!file.isFile() || file.isSymbolicLink()) {
    throw new Error(`Protected toolchain input must be a regular file: ${protectedPath}`);
  }
  const realPath = realpathSync.native(candidatePath);
  if (!isContainedPath(sourceRoot, realPath)) {
    throw new Error(`Protected toolchain input escapes its root: ${protectedPath}`);
  }
  return realPath;
}

function assertEvidenceMatches(evidence, expectedDigest, label) {
  if (evidence.digest !== expectedDigest) {
    throw new Error(`${label} digest differs from the capture startup digest.`);
  }
  const actualPaths = evidence.files.map(({ path }) => path);
  if (JSON.stringify(actualPaths) !== JSON.stringify([...TOOLCHAIN_PATHS].sort())) {
    throw new Error(`${label} does not contain the exact protected path set.`);
  }
}

/**
 * Verify an existing isolated toolchain snapshot against its startup digest.
 */
export function verifyLegacyToolchainSnapshot(snapshotRoot, expectedDigest) {
  const digest = requireSha256(expectedDigest, 'Expected toolchain snapshot digest');
  const resolvedRoot = resolveSourceRoot(snapshotRoot);
  const evidence = readRepositoryToolchain(resolvedRoot);
  assertEvidenceMatches(evidence, digest, 'Toolchain snapshot');
  return { ...evidence, root: resolvedRoot };
}

/**
 * Copy every protected capture input into one content-addressed snapshot.
 */
export function createLegacyToolchainSnapshot(
  repositoryRoot,
  snapshotRoot,
  expectedDigest,
) {
  const digest = requireSha256(expectedDigest, 'Expected capture startup digest');
  const sourceRoot = resolveSourceRoot(repositoryRoot);
  const resolvedSnapshotRoot = resolveSnapshotRoot(sourceRoot, snapshotRoot);
  const sourceEvidenceBeforeCopy = readRepositoryToolchain(sourceRoot);
  assertEvidenceMatches(
    sourceEvidenceBeforeCopy,
    digest,
    'Capture source before snapshot',
  );

  mkdirSync(resolvedSnapshotRoot);
  for (const protectedPath of TOOLCHAIN_PATHS) {
    const sourcePath = resolveProtectedSourceFile(sourceRoot, protectedPath);
    const destinationPath = resolve(
      resolvedSnapshotRoot,
      ...protectedPath.split('/'),
    );
    mkdirSync(dirname(destinationPath), { recursive: true });
    copyFileSync(sourcePath, destinationPath, constants.COPYFILE_EXCL);
  }

  const snapshotEvidence = readRepositoryToolchain(resolvedSnapshotRoot);
  assertEvidenceMatches(snapshotEvidence, digest, 'Toolchain snapshot');
  const sourceEvidenceAfterCopy = readRepositoryToolchain(sourceRoot);
  assertEvidenceMatches(
    sourceEvidenceAfterCopy,
    digest,
    'Capture source after snapshot',
  );
  if (
    JSON.stringify(snapshotEvidence.files)
    !== JSON.stringify(sourceEvidenceBeforeCopy.files)
  ) {
    throw new Error('Toolchain snapshot file evidence differs from its source.');
  }

  for (const protectedPath of TOOLCHAIN_PATHS) {
    chmodSync(
      resolve(resolvedSnapshotRoot, ...protectedPath.split('/')),
      0o444,
    );
  }
  return { ...snapshotEvidence, root: resolvedSnapshotRoot };
}

function comparableRealPath(path) {
  const realPath = realpathSync.native(resolve(path));
  return platform() === 'win32' ? realPath.toLowerCase() : realPath;
}

const invokedPath = process.argv[1]
  ? comparableRealPath(process.argv[1])
  : '';
if (invokedPath === comparableRealPath(fileURLToPath(import.meta.url))) {
  const command = process.argv[2] ?? '';
  const root = resolve(process.argv[3] ?? '');
  const expectedDigest = process.argv[5] ?? '';
  const evidence = command === 'create'
    ? createLegacyToolchainSnapshot(root, resolve(process.argv[4] ?? ''), expectedDigest)
    : command === 'verify'
      ? verifyLegacyToolchainSnapshot(root, process.argv[4] ?? '')
      : null;
  if (!evidence) {
    throw new Error(`Unsupported toolchain snapshot command: ${command}`);
  }
  process.stdout.write(`${evidence.digest}\n`);
}
