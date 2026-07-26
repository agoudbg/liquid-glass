import { createHash } from 'node:crypto';
import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { platform } from 'node:os';
import {
  dirname,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requirePackageVersion(packagePath, label) {
  const packageValue = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (
    packageValue === null
    || typeof packageValue !== 'object'
    || Array.isArray(packageValue)
    || typeof packageValue.version !== 'string'
    || packageValue.version.length === 0
  ) {
    throw new Error(`${label} package version is invalid.`);
  }
  return packageValue.version;
}

function collectDirectoryFiles(directoryRoot) {
  const root = realpathSync.native(directoryRoot);
  const pendingDirectories = [root];
  const files = [];
  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const path = resolve(directory, entry.name);
      const file = lstatSync(path);
      if (file.isSymbolicLink()) {
        throw new Error('Playwright CLI package directory must not contain symlinks.');
      }
      if (file.isDirectory()) {
        pendingDirectories.push(path);
      } else if (file.isFile()) {
        files.push({
          path: relative(root, path).replaceAll('\\', '/'),
          sha256: sha256(readFileSync(path)),
        });
      } else {
        throw new Error('Playwright CLI package contains an unsupported entry.');
      }
    }
  }
  return files.sort(({ path: left }, { path: right }) => {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
}

function packageEvidence(name, packagePath) {
  return {
    files: collectDirectoryFiles(dirname(packagePath)),
    name,
  };
}

function packageEvidenceDigest(packages) {
  const sortedPackages = packages.toSorted(({ name: left }, { name: right }) => {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
  if (sortedPackages.some(({ files }) => files.length === 0)) {
    throw new Error('Playwright package directory is empty.');
  }
  return sha256(JSON.stringify(sortedPackages));
}

function resolveRuntimePackagePaths(searchRoot, entryPackageName) {
  const canonicalSearchRoot = realpathSync.native(resolve(searchRoot));
  const requireFromSearchRoot = createRequire(
    resolve(canonicalSearchRoot, '__legacy-playwright-runtime-probe.cjs'),
  );
  const entryPackagePath = requireFromSearchRoot.resolve(
    `${entryPackageName}/package.json`,
  );
  // Resolve dependencies from the entry package so npm and pnpm layouts produce
  // evidence for the bytes that the entry point will actually execute.
  const requireFromEntryPackage = createRequire(entryPackagePath);
  return {
    corePackagePath: requireFromEntryPackage.resolve(
      'playwright-core/package.json',
    ),
    entryPackagePath,
    playwrightPackagePath: requireFromEntryPackage.resolve(
      'playwright/package.json',
    ),
  };
}

function readPackageRuntimeEvidence(searchRoot, entryPackageName) {
  const {
    corePackagePath,
    entryPackagePath,
    playwrightPackagePath,
  } = resolveRuntimePackagePaths(searchRoot, entryPackageName);
  const playwrightVersion = requirePackageVersion(
    playwrightPackagePath,
    'playwright',
  );
  const playwrightCoreVersion = requirePackageVersion(
    corePackagePath,
    'playwright-core',
  );
  if (playwrightVersion !== playwrightCoreVersion) {
    throw new Error('Playwright and playwright-core package versions differ.');
  }
  return {
    entryPackageDigest: packageEvidenceDigest([
      packageEvidence(entryPackageName, entryPackagePath),
    ]),
    entryPackageVersion: requirePackageVersion(
      entryPackagePath,
      entryPackageName,
    ),
    playwrightRuntimePackageDigest: packageEvidenceDigest([
      packageEvidence('playwright', playwrightPackagePath),
      packageEvidence('playwright-core', corePackagePath),
    ]),
    playwrightCoreVersion,
  };
}

/**
 * Read the globally installed CLI package, its shared browser runtime, and the
 * exact launcher selected by the shell.
 */
export function readPlaywrightCliRuntimeEvidence(
  searchRoot,
  launcherPath,
) {
  const evidence = readPackageRuntimeEvidence(searchRoot, '@playwright/cli');
  const canonicalLauncherPath = realpathSync.native(resolve(launcherPath));
  if (!statSync(canonicalLauncherPath).isFile()) {
    throw new Error('Playwright CLI launcher must be a file.');
  }
  return {
    playwrightCliLauncherDigest: sha256(readFileSync(canonicalLauncherPath)),
    playwrightCliPackageDigest: evidence.entryPackageDigest,
    playwrightCliVersion: evidence.entryPackageVersion,
    playwrightCoreVersion: evidence.playwrightCoreVersion,
    playwrightRuntimePackageDigest:
      evidence.playwrightRuntimePackageDigest,
  };
}

/**
 * Read the exact Playwright Test facade and shared browser runtime used by the
 * candidate visual gate.
 */
export function readPlaywrightTestRuntimeEvidence(searchRoot) {
  const evidence = readPackageRuntimeEvidence(searchRoot, '@playwright/test');
  if (evidence.entryPackageVersion !== evidence.playwrightCoreVersion) {
    throw new Error(
      '@playwright/test and playwright-core package versions differ.',
    );
  }
  return {
    playwrightCoreVersion: evidence.playwrightCoreVersion,
    playwrightRuntimePackageDigest:
      evidence.playwrightRuntimePackageDigest,
    playwrightTestPackageDigest: evidence.entryPackageDigest,
    playwrightTestVersion: evidence.entryPackageVersion,
  };
}

function comparableRealPath(path) {
  const realPath = realpathSync.native(resolve(path));
  return platform() === 'win32' ? realPath.toLowerCase() : realPath;
}

const invokedPath = process.argv[1]
  ? comparableRealPath(process.argv[1])
  : '';
if (invokedPath === comparableRealPath(fileURLToPath(import.meta.url))) {
  const mode = process.argv[2];
  let evidence;
  if (mode === 'capture') {
    evidence = readPlaywrightCliRuntimeEvidence(
      process.argv[3] ?? '',
      process.argv[4] ?? '',
    );
  } else if (mode === 'candidate') {
    evidence = readPlaywrightTestRuntimeEvidence(process.argv[3] ?? '');
  } else {
    throw new Error(
      'Playwright runtime evidence mode must be capture or candidate.',
    );
  }
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}
