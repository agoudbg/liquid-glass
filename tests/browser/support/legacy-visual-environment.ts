import { execFileSync } from 'node:child_process';
import {
  existsSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { resolve } from 'node:path';

/**
 * Repository inputs protected by every publishable legacy visual capture.
 *
 * Keep this sorted set aligned with `TOOLCHAIN_PATHS` in the capture contract
 * generator. The parser rejects subsets and supersets so provenance cannot
 * silently omit a capture input.
 */
export const LEGACY_VISUAL_TOOLCHAIN_PATHS = [
  '.node-version',
  'scripts/legacy/analyze-legacy-oracle.mjs',
  'scripts/legacy/capture-legacy-oracle.ps1',
  'scripts/legacy/legacy-capture-config.mjs',
  'scripts/legacy/legacy-capture-contract.mjs',
  'scripts/legacy/legacy-capture-evidence.mjs',
  'scripts/legacy/legacy-capture-helpers.ps1',
  'scripts/legacy/legacy-capture-validation.ps1',
  'scripts/legacy/legacy-image-analysis.mjs',
  'scripts/legacy/legacy-playwright-runtime.mjs',
  'scripts/legacy/legacy-promotion-transaction.ps1',
  'scripts/legacy/legacy-toolchain-snapshot.mjs',
  'scripts/legacy/sync-legacy-visual-manifest.mjs',
  'tests/legacy-oracle/capture-contract-probe.js',
  'tests/legacy-oracle/capture-run-code.js',
  'tests/legacy-oracle/config/dpr-1.json',
  'tests/legacy-oracle/config/dpr-2.json',
  'tests/legacy-oracle/harness/OracleApp.vue',
  'tests/legacy-oracle/harness/main.ts',
  'tests/legacy-oracle/harness/oracle.css',
] as const;

const SHA_256_PATTERN = /^[a-f0-9]{64}$/u;

/** Candidate Playwright package evidence recomputed by the shared runtime tool. */
export interface LegacyVisualPlaywrightRuntimeEvidence {
  /** Version of both the candidate facade and its browser runtime. */
  playwrightCoreVersion: string;
  /** Aggregate identity of the shared playwright and playwright-core bytes. */
  playwrightRuntimePackageDigest: string;
  /** Content identity of the candidate-only @playwright/test facade. */
  playwrightTestPackageDigest: string;
  /** Installed @playwright/test version. */
  playwrightTestVersion: string;
}

/** Baseline runtime fields required to admit a candidate visual process. */
export interface LegacyVisualExpectedPlaywrightRuntime {
  /** Calibrated Playwright browser runtime version. */
  playwrightCoreVersion: string;
  /** Calibrated aggregate identity of shared runtime package bytes. */
  playwrightRuntimePackageDigest: string;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readString(
  value: unknown,
  label: string,
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function readSha256(value: unknown, label: string): string {
  const digest = readString(value, label);
  if (!SHA_256_PATTERN.test(digest)) {
    throw new Error(`${label} must be a lowercase SHA-256.`);
  }
  return digest;
}

function readChromeOverride(environment: NodeJS.ProcessEnv): string | undefined {
  const configuredPath = environment.LIQUID_GLASS_VISUAL_CHROME_PATH?.trim();
  if (configuredPath) return configuredPath;
  const compatibilityPath =
    environment.LIQUID_GLASS_VISUAL_CHROME_EXECUTABLE?.trim();
  return compatibilityPath || undefined;
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/**
 * Resolve installed Chrome using the same override contract as capture.
 *
 * `LIQUID_GLASS_VISUAL_CHROME_PATH` is canonical. The older
 * `LIQUID_GLASS_VISUAL_CHROME_EXECUTABLE` name remains a compatibility alias.
 */
export function resolveLegacyVisualChromeExecutable(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const override = readChromeOverride(environment);
  if (override) {
    const absoluteOverride = resolve(override);
    if (!isFile(absoluteOverride)) {
      throw new Error(
        'Configured visual Chrome path does not identify a file: '
        + absoluteOverride,
      );
    }
    return realpathSync.native(absoluteOverride);
  }

  const roots = [
    environment.ProgramFiles,
    environment['ProgramFiles(x86)'],
    environment.LOCALAPPDATA,
  ].filter((entry): entry is string => Boolean(entry?.trim()));
  const executable = roots
    .map((root) => resolve(
      root,
      'Google',
      'Chrome',
      'Application',
      'chrome.exe',
    ))
    .find(isFile);
  if (!executable) {
    throw new Error(
      'Installed Google Chrome could not be resolved. Set '
      + 'LIQUID_GLASS_VISUAL_CHROME_PATH to an installed chrome.exe.',
    );
  }
  return realpathSync.native(executable);
}

/**
 * Read exact @playwright/test, playwright, and playwright-core package bytes.
 *
 * The subprocess executes the same content-addressed helper used by the oracle
 * capture, preventing the gate and capture from drifting to different hashing
 * algorithms.
 */
export function readLegacyVisualPlaywrightRuntimeEvidence(
  repositoryRoot: string,
): LegacyVisualPlaywrightRuntimeEvidence {
  const runtimeToolPath = resolve(
    repositoryRoot,
    'scripts/legacy/legacy-playwright-runtime.mjs',
  );
  const output = execFileSync(
    process.execPath,
    [runtimeToolPath, 'candidate', repositoryRoot],
    {
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  const value = expectRecord(
    JSON.parse(output) as unknown,
    'Candidate Playwright runtime evidence',
  );
  const expectedKeys = [
    'playwrightCoreVersion',
    'playwrightRuntimePackageDigest',
    'playwrightTestPackageDigest',
    'playwrightTestVersion',
  ];
  const actualKeys = Object.keys(value).sort();
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      'Candidate Playwright runtime evidence contains unexpected fields.',
    );
  }
  return {
    playwrightCoreVersion: readString(
      value.playwrightCoreVersion,
      'Candidate playwright-core version',
    ),
    playwrightRuntimePackageDigest: readSha256(
      value.playwrightRuntimePackageDigest,
      'Candidate Playwright runtime package digest',
    ),
    playwrightTestPackageDigest: readSha256(
      value.playwrightTestPackageDigest,
      'Candidate @playwright/test package digest',
    ),
    playwrightTestVersion: readString(
      value.playwrightTestVersion,
      'Candidate @playwright/test version',
    ),
  };
}

/** Reject candidate runtime versions or bytes that differ from calibration. */
export function validateLegacyVisualPlaywrightRuntime(
  expected: LegacyVisualExpectedPlaywrightRuntime,
  actual: LegacyVisualPlaywrightRuntimeEvidence,
): void {
  if (
    actual.playwrightCoreVersion !== expected.playwrightCoreVersion
    || actual.playwrightTestVersion !== expected.playwrightCoreVersion
  ) {
    throw new Error(
      'Candidate Playwright package versions differ from calibration.',
    );
  }
  if (
    actual.playwrightRuntimePackageDigest
    !== expected.playwrightRuntimePackageDigest
  ) {
    throw new Error(
      'Candidate Playwright runtime package bytes differ from calibration.',
    );
  }
}
