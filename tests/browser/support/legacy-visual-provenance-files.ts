import { createHash } from 'node:crypto';
import {
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';

interface ContentAddressedFile {
  path: string;
  sha256: string;
}

function canonicalJson(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Canonical JSON rejects non-finite numbers.');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new Error(`Canonical JSON rejects ${typeof value} values.`);
  }
  if (ancestors.has(value)) {
    throw new Error('Canonical JSON rejects cyclic values.');
  }
  ancestors.add(value);
  let result: string;
  if (Array.isArray(value)) {
    result = `[${value.map((entry) => (
      canonicalJson(entry, ancestors)
    )).join(',')}]`;
  } else {
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Canonical JSON accepts only plain objects and arrays.');
    }
    const record = value as Record<string, unknown>;
    result = `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(record[key], ancestors)}`
    )).join(',')}}`;
  }
  ancestors.delete(value);
  return result;
}

/** Hash recursive-key-sorted canonical JSON with SHA-256. */
export function computeLegacyVisualCanonicalSha256(value: unknown): string {
  return createHash('sha256')
    .update(canonicalJson(value, new Set()), 'utf8')
    .digest('hex');
}

/** Compute the aggregate repository digest from a sorted file manifest. */
export function computeLegacyVisualRepositoryDigest(
  files: readonly ContentAddressedFile[],
): string {
  return computeLegacyVisualCanonicalSha256(files);
}

/** Compute the lowercase SHA-256 identity of one file. */
export function computeLegacyVisualFileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function resolveContainedFile(root: string, path: string, label: string): string {
  const rootRealPath = realpathSync.native(root);
  const fileRealPath = realpathSync.native(
    resolve(rootRealPath, ...path.split('/')),
  );
  const relation = relative(rootRealPath, fileRealPath);
  if (
    relation === '..'
    || relation.startsWith(`..${sep}`)
    || isAbsolute(relation)
  ) {
    throw new Error(`${label} resolves outside its root.`);
  }
  if (!statSync(fileRealPath).isFile()) {
    throw new Error(`${label} must be a file.`);
  }
  return fileRealPath;
}

/** Validate each content-addressed file beneath one canonical root. */
export function validateLegacyVisualContentAddressedFiles(
  files: readonly ContentAddressedFile[],
  root: string,
  label: string,
): void {
  for (const file of files) {
    const path = resolveContainedFile(
      root,
      file.path,
      `${label} ${file.path}`,
    );
    if (computeLegacyVisualFileSha256(path) !== file.sha256) {
      throw new Error(`${label} ${file.path} SHA-256 drifted.`);
    }
  }
}

/** Validate repository files and their aggregate manifest identity. */
export function validateLegacyVisualRepositoryFiles(
  files: readonly ContentAddressedFile[],
  digest: string,
  repositoryRoot: string,
): void {
  validateLegacyVisualContentAddressedFiles(
    files,
    repositoryRoot,
    'Repository file',
  );
  const actualFiles = files.map(({ path }) => ({
    path,
    sha256: computeLegacyVisualFileSha256(
      resolveContainedFile(
        repositoryRoot,
        path,
        `Repository file ${path}`,
      ),
    ),
  }));
  if (computeLegacyVisualRepositoryDigest(actualFiles) !== digest) {
    throw new Error('Repository aggregate SHA-256 drifted.');
  }
}
