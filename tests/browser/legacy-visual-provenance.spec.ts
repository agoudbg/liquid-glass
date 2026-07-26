import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  LEGACY_VISUAL_TOOLCHAIN_PATHS,
  validateLegacyVisualPlaywrightRuntime,
} from './support/legacy-visual-environment';
import {
  computeLegacyVisualCanonicalSha256,
  computeLegacyVisualRepositoryDigest,
  type LegacyVisualProvenanceContract,
  parseLegacyVisualProvenanceContract,
  parseLegacyVisualSha256,
  validateLegacyVisualLocalHostProvenance,
  validateLegacyVisualRepositoryProvenance,
} from './support/legacy-visual-provenance';

const HASH_A = 'a'.repeat(64);
const CHROME_VERSION = '150.0.7871.129';
const DISTRIBUTION_NAMES = [
  'chrome.dll',
  'libEGL.dll',
  'libGLESv2.dll',
  'vk_swiftshader.dll',
  'vk_swiftshader_icd.json',
  'vulkan-1.dll',
] as const;
const CALIBRATION_PATH =
  'tests/baselines/legacy/visual-calibration.json';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sortFiles<T extends { path: string }>(files: T[]): T[] {
  return files.sort((first, second) => (
    first.path < second.path ? -1 : first.path > second.path ? 1 : 0
  ));
}

function clone(value: unknown): unknown {
  return structuredClone(value);
}

function expectRecord(value: unknown): asserts value is Record<string, unknown> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBe(false);
}

function readRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  expectRecord(value[key]);
  return value[key];
}

function createFixture(): LegacyVisualProvenanceContract {
  const files = LEGACY_VISUAL_TOOLCHAIN_PATHS.map((path) => ({
    path,
    sha256: HASH_A,
  }));
  return parseLegacyVisualProvenanceContract({
    browser: {
      arguments: [
        '--enable-automation',
        '--use-angle=swiftshader',
        '--use-gl=angle',
        '--force-color-profile=srgb',
      ],
      browserName: 'Google Chrome',
      browserVersion: CHROME_VERSION,
      channel: 'chrome',
      distributionFiles: sortFiles([
        { path: 'chrome.exe', sha256: HASH_A },
        ...DISTRIBUTION_NAMES.map((fileName) => ({
          path: `${CHROME_VERSION}/${fileName}`,
          sha256: HASH_A,
        })),
      ]),
      effectiveArguments: [
        '--disable-blink-features=AutomationControlled',
        '--enable-automation',
        '--force-color-profile=srgb',
        '--use-angle=swiftshader',
        '--use-gl=angle',
      ],
      headless: true,
      protocol: {
        jsVersion: '14.0.0',
        product: `Chrome/${CHROME_VERSION}`,
        protocolVersion: '1.3',
        revision: '@fixture',
      },
      webGlFingerprint: {
        renderer: 'WebKit WebGL',
        shadingLanguageVersion: 'WebGL GLSL ES 3.00',
        unmaskedRenderer: 'ANGLE SwiftShader',
        unmaskedVendor: 'Google Inc.',
        vendor: 'WebKit',
        version: 'WebGL 2.0',
      },
    },
    context: {
      colorScheme: 'light',
      devicePixelRatios: [1, 2],
      locale: 'en-US',
      reducedMotion: 'reduce',
      timezoneId: 'UTC',
      viewport: { height: 900, width: 1440 },
    },
    host: {
      arch: 'x64',
      fonts: [
        { fileName: 'arial.ttf', sha256: HASH_A },
        { fileName: 'arialbd.ttf', sha256: HASH_A },
      ],
      osRelease: 'fixture-release',
      platform: 'win32',
    },
    repository: {
      digest: computeLegacyVisualRepositoryDigest(files),
      files,
    },
    runtime: {
      nodeVersion: '22.22.0',
      playwrightCliLauncherDigest: sha256('playwright-cli-launcher'),
      playwrightCliPackageDigest: sha256('playwright-cli-package'),
      playwrightRuntimePackageDigest: sha256('playwright-runtime-packages'),
      playwrightCliVersion: '0.1.17',
      playwrightCoreVersion: '1.62.0-alpha-1783623505000',
      pnpmVersion: '10.32.0',
    },
    schemaVersion: 1,
  });
}

function mutateFixture(
  mutate: (fixture: Record<string, unknown>) => void,
): unknown {
  const fixture = clone(createFixture());
  expectRecord(fixture);
  mutate(fixture);
  return fixture;
}

function writeFixtureFile(root: string, path: string, content: string): string {
  const target = resolve(root, ...path.split('/'));
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, content);
  return sha256(content);
}

function readCommittedContract(): LegacyVisualProvenanceContract {
  const calibration = JSON.parse(
    readFileSync(resolve(process.cwd(), CALIBRATION_PATH), 'utf8'),
  ) as unknown;
  expectRecord(calibration);
  const captureEvidence = readRecord(calibration, 'captureEvidence');
  return parseLegacyVisualProvenanceContract(
    captureEvidence.contract,
    'calibration.captureEvidence.contract',
  );
}

test.describe('legacy visual provenance contract', () => {
  test('canonical hashing is stable across recursive object key order', () => {
    const first = {
      beta: [{ zeta: 2, alpha: 1 }],
      alpha: { delta: true, charlie: 'value' },
    };
    const second = {
      alpha: { charlie: 'value', delta: true },
      beta: [{ alpha: 1, zeta: 2 }],
    };

    expect(computeLegacyVisualCanonicalSha256(first))
      .toBe(computeLegacyVisualCanonicalSha256(second));
    expect(computeLegacyVisualCanonicalSha256(first)).toMatch(/^[a-f0-9]{64}$/u);
  });

  test('strictly parses the complete Windows capture contract', () => {
    const contract = createFixture();

    expect(contract.schemaVersion).toBe(1);
    expect(contract.host.fonts.map(({ fileName }) => fileName))
      .toEqual(['arial.ttf', 'arialbd.ttf']);
    expect(contract.browser.distributionFiles).toHaveLength(7);
    expect(contract.browser.effectiveArguments).toContain(
      '--disable-blink-features=AutomationControlled',
    );
    expect(contract.context.devicePixelRatios).toEqual([1, 2]);
  });

  test('rejects invalid, missing, and aggregate-mismatched SHA values', () => {
    expect(() => parseLegacyVisualSha256('ABC', 'fixture.sha256'))
      .toThrow('fixture.sha256 must be a lowercase SHA-256.');

    expect(() => parseLegacyVisualProvenanceContract(mutateFixture((fixture) => {
      readRecord(fixture, 'runtime').playwrightRuntimePackageDigest = 'A'.repeat(64);
    }))).toThrow(
      'captureContract.runtime.playwrightRuntimePackageDigest must be a lowercase SHA-256.',
    );

    expect(() => parseLegacyVisualProvenanceContract(mutateFixture((fixture) => {
      readRecord(fixture, 'runtime').playwrightCliLauncherDigest = 'A'.repeat(64);
    }))).toThrow(
      'captureContract.runtime.playwrightCliLauncherDigest must be a lowercase SHA-256.',
    );

    expect(() => parseLegacyVisualProvenanceContract(mutateFixture((fixture) => {
      const repository = readRecord(fixture, 'repository');
      const files = repository.files;
      if (!Array.isArray(files)) throw new Error('Fixture files are missing.');
      expectRecord(files[0]);
      delete files[0].sha256;
    }))).toThrow(
      'captureContract.repository.files[0] must contain exactly: path, sha256.',
    );

    expect(() => parseLegacyVisualProvenanceContract(mutateFixture((fixture) => {
      readRecord(fixture, 'repository').digest = 'b'.repeat(64);
    }))).toThrow(
      'captureContract.repository.digest does not match its file manifest.',
    );
  });

  test('rejects candidate runtime byte drift even when versions match', () => {
    const expected = createFixture().runtime;
    const actual = {
      playwrightCoreVersion: expected.playwrightCoreVersion,
      playwrightRuntimePackageDigest:
        expected.playwrightRuntimePackageDigest,
      playwrightTestPackageDigest: HASH_A,
      playwrightTestVersion: expected.playwrightCoreVersion,
    };

    expect(() => validateLegacyVisualPlaywrightRuntime(expected, actual))
      .not.toThrow();
    expect(() => validateLegacyVisualPlaywrightRuntime(expected, {
      ...actual,
      playwrightRuntimePackageDigest: 'b'.repeat(64),
    })).toThrow(
      'Candidate Playwright runtime package bytes differ from calibration.',
    );
    expect(() => validateLegacyVisualPlaywrightRuntime(expected, {
      ...actual,
      playwrightTestVersion: '1.62.0-alpha-drift',
    })).toThrow(
      'Candidate Playwright package versions differ from calibration.',
    );
  });

  test('rejects incomplete or expanded repository toolchain manifests', () => {
    expect(() => parseLegacyVisualProvenanceContract(
      mutateFixture((fixture) => {
        const repository = readRecord(fixture, 'repository');
        if (!Array.isArray(repository.files)) {
          throw new Error('Fixture files are missing.');
        }
        repository.files.pop();
      }),
    )).toThrow(
      'captureContract.repository.files must contain exactly '
      + 'the protected visual toolchain paths.',
    );

    expect(() => parseLegacyVisualProvenanceContract(
      mutateFixture((fixture) => {
        const repository = readRecord(fixture, 'repository');
        if (!Array.isArray(repository.files)) {
          throw new Error('Fixture files are missing.');
        }
        repository.files.push({
          path: 'tests/legacy-oracle/unprotected.js',
          sha256: HASH_A,
        });
      }),
    )).toThrow(
      'captureContract.repository.files must contain exactly '
      + 'the protected visual toolchain paths.',
    );
  });

  test('rejects missing deterministic Chrome arguments', () => {
    for (const argument of [
      '--enable-automation',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--force-color-profile=srgb',
    ]) {
      expect(() => parseLegacyVisualProvenanceContract(
        mutateFixture((fixture) => {
          const browser = readRecord(fixture, 'browser');
          if (!Array.isArray(browser.arguments)) {
            throw new Error('Fixture arguments are missing.');
          }
          browser.arguments = browser.arguments.filter(
            (entry) => entry !== argument,
          );
        }),
      )).toThrow(`captureContract.browser.arguments must include ${argument}.`);
    }
  });

  test('rejects unnormalized effective Chrome arguments', () => {
    expect(() => parseLegacyVisualProvenanceContract(
      mutateFixture((fixture) => {
        const browser = readRecord(fixture, 'browser');
        if (!Array.isArray(browser.effectiveArguments)) {
          throw new Error('Fixture effective arguments are missing.');
        }
        browser.effectiveArguments.reverse();
      }),
    )).toThrow(
      'captureContract.browser.effectiveArguments must be sorted.',
    );

    expect(() => parseLegacyVisualProvenanceContract(
      mutateFixture((fixture) => {
        const browser = readRecord(fixture, 'browser');
        if (!Array.isArray(browser.effectiveArguments)) {
          throw new Error('Fixture effective arguments are missing.');
        }
        browser.effectiveArguments = browser.effectiveArguments.filter(
          (argument) => argument !== '--use-gl=angle',
        );
      }),
    )).toThrow(
      'captureContract.browser.effectiveArguments must include --use-gl=angle.',
    );

    expect(() => parseLegacyVisualProvenanceContract(
      mutateFixture((fixture) => {
        const browser = readRecord(fixture, 'browser');
        if (!Array.isArray(browser.effectiveArguments)) {
          throw new Error('Fixture effective arguments are missing.');
        }
        browser.effectiveArguments.push('--user-data-dir=C:/temporary');
      }),
    )).toThrow(
      'captureContract.browser.effectiveArguments must not contain '
      + 'ephemeral Chrome switches.',
    );
  });

  test('rejects non-Windows, incomplete Arial, and distribution contracts', () => {
    expect(() => parseLegacyVisualProvenanceContract(mutateFixture((fixture) => {
      readRecord(fixture, 'host').platform = 'linux';
    }))).toThrow('captureContract.host.platform must be win32.');

    expect(() => parseLegacyVisualProvenanceContract(mutateFixture((fixture) => {
      const host = readRecord(fixture, 'host');
      if (!Array.isArray(host.fonts)) throw new Error('Fixture fonts are missing.');
      host.fonts = host.fonts.slice(0, 1);
    }))).toThrow('captureContract.host.fonts must include arialbd.ttf.');

    expect(() => parseLegacyVisualProvenanceContract(mutateFixture((fixture) => {
      const browser = readRecord(fixture, 'browser');
      if (!Array.isArray(browser.distributionFiles)) {
        throw new Error('Fixture distribution is missing.');
      }
      browser.distributionFiles = browser.distributionFiles.filter(
        (entry) => {
          expectRecord(entry);
          return entry.path !== `${CHROME_VERSION}/chrome.dll`;
        },
      );
    }))).toThrow(
      `captureContract.browser.distributionFiles must include ${CHROME_VERSION}/chrome.dll.`,
    );
  });

  test('detects repository file drift in a temporary repository', ({
    browserName: _browserName,
  }, testInfo) => {
    const root = testInfo.outputPath('repository');
    mkdirSync(root, { recursive: true });
    const files = LEGACY_VISUAL_TOOLCHAIN_PATHS.map((path) => ({
      path,
      sha256: writeFixtureFile(root, path, `${path}\n`),
    }));
    const contract = createFixture();
    contract.repository = {
      digest: computeLegacyVisualRepositoryDigest(files),
      files,
    };

    expect(() => validateLegacyVisualRepositoryProvenance(contract, root))
      .not.toThrow();
    writeFileSync(resolve(root, '.node-version'), '22.23.0\n');
    expect(() => validateLegacyVisualRepositoryProvenance(contract, root))
      .toThrow('Repository file .node-version SHA-256 drifted.');
  });

  test('validates committed current-repository provenance in preflight', () => {
    const contract = readCommittedContract();

    expect(() => validateLegacyVisualRepositoryProvenance(
      contract,
      process.cwd(),
    )).not.toThrow();
  });

  test('validates and detects drift in local Arial and Chrome files', ({
    browserName: _browserName,
  }, testInfo) => {
    const root = testInfo.outputPath('local-host');
    const windowsRoot = resolve(root, 'Windows');
    const applicationRoot = resolve(root, 'Chrome', 'Application');
    const fonts = [
      {
        fileName: 'arial.ttf',
        sha256: writeFixtureFile(windowsRoot, 'Fonts/arial.ttf', 'arial'),
      },
      {
        fileName: 'arialbd.ttf',
        sha256: writeFixtureFile(windowsRoot, 'Fonts/arialbd.ttf', 'arial-bold'),
      },
    ];
    const distributionFiles = sortFiles([
      {
        path: 'chrome.exe',
        sha256: writeFixtureFile(applicationRoot, 'chrome.exe', 'chrome'),
      },
      ...DISTRIBUTION_NAMES.map((fileName) => ({
        path: `${CHROME_VERSION}/${fileName}`,
        sha256: writeFixtureFile(
          applicationRoot,
          `${CHROME_VERSION}/${fileName}`,
          fileName,
        ),
      })),
    ]);
    const contract = createFixture();
    contract.host.fonts = fonts;
    contract.browser.distributionFiles = distributionFiles;
    const options = {
      arch: 'x64',
      environment: {
        LIQUID_GLASS_VISUAL_CHROME_PATH: resolve(applicationRoot, 'chrome.exe'),
        LIQUID_GLASS_VISUAL_CHROME_EXECUTABLE: resolve(
          root,
          'ignored',
          'chrome.exe',
        ),
        WINDIR: windowsRoot,
      },
      nodeVersion: '22.22.0',
      osRelease: 'fixture-release',
      platform: 'win32' as const,
    };

    expect(() => validateLegacyVisualLocalHostProvenance(contract, options))
      .not.toThrow();
    writeFileSync(resolve(applicationRoot, CHROME_VERSION, 'chrome.dll'), 'drift');
    expect(() => validateLegacyVisualLocalHostProvenance(contract, options))
      .toThrow(
        `Chrome distribution file ${CHROME_VERSION}/chrome.dll SHA-256 drifted.`,
      );
  });
});
