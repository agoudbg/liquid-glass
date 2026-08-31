import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE_PACKAGE_PATHS = [
  'packages/core/package.json',
  'packages/vue/package.json',
  'packages/react/package.json',
  'packages/solid/package.json',
];

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

/** Validate that a version is a complete semver value suitable for publishing. */
export function validateVersion(version, packagePath) {
  if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) {
    throw new Error(`${packagePath} has invalid publish version: ${String(version)}`);
  }
  return version;
}

/** Ensure every public package participates in one synchronized release. */
export function validatePackageVersions(packageVersions) {
  const versions = [...new Set(packageVersions.map(({ version }) => version))];
  if (versions.length !== 1) {
    throw new Error(`Release package versions must match; received ${versions.join(', ')}.`);
  }
  return versions[0];
}

/** Ensure the merged version PR changed every package manifest. */
export function validateChangedReleaseFiles(changedFiles) {
  const changed = new Set(changedFiles);
  const missing = RELEASE_PACKAGE_PATHS.filter((packagePath) => !changed.has(packagePath));
  if (missing.length > 0) {
    throw new Error(`Release commit did not update: ${missing.join(', ')}.`);
  }
}

function readReleasePackages() {
  return RELEASE_PACKAGE_PATHS.map((packagePath) => {
    const manifest = JSON.parse(readFileSync(resolve(packagePath), 'utf8'));
    return {
      path: packagePath,
      name: manifest.name,
      version: validateVersion(manifest.version, packagePath),
    };
  });
}

function readArgument(args, name) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing required argument ${name}.`);
  }
  return value;
}

function readChangedFiles(base, head) {
  const output = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRT', base, head], {
    encoding: 'utf8',
  });
  return output.split(/\r?\n/u).filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  const base = readArgument(args, '--base');
  const head = readArgument(args, '--head');
  const changedFiles = readChangedFiles(base, head);
  validateChangedReleaseFiles(changedFiles);
  const packages = readReleasePackages();
  const version = validatePackageVersions(packages);
  console.log(`Validated synchronized release ${version}: ${packages.map(({ name }) => name).join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
