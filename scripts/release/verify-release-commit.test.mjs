import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RELEASE_PACKAGE_PATHS,
  validateChangedReleaseFiles,
  validatePackageVersions,
  validateVersion,
} from './verify-release-commit.mjs';

test('accepts stable and prerelease publish versions', () => {
  assert.equal(validateVersion('1.0.0-alpha.0', 'core/package.json'), '1.0.0-alpha.0');
  assert.equal(validateVersion('1.0.0', 'core/package.json'), '1.0.0');
});

test('rejects malformed publish versions', () => {
  assert.throws(
    () => validateVersion('v1.0.0', 'core/package.json'),
    /invalid publish version/u,
  );
});

test('requires synchronized package versions', () => {
  assert.equal(validatePackageVersions([
    { version: '1.0.0-alpha.0' },
    { version: '1.0.0-alpha.0' },
  ]), '1.0.0-alpha.0');
  assert.throws(
    () => validatePackageVersions([
      { version: '1.0.0-alpha.0' },
      { version: '1.0.0-alpha.1' },
    ]), /must match/u,
  );
});

test('requires every public package manifest in the release diff', () => {
  assert.doesNotThrow(() => validateChangedReleaseFiles(RELEASE_PACKAGE_PATHS));
  assert.throws(
    () => validateChangedReleaseFiles(RELEASE_PACKAGE_PATHS.slice(1)),
    /packages\/core\/package\.json/u,
  );
});
