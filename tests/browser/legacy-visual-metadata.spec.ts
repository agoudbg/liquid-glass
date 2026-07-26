import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  compareLegacyMaskedPngPixels,
} from './support/legacy-visual-comparator';
import {
  type LegacyVisualGateMetadata,
  parseLegacyVisualGateMetadata,
  validateLegacyVisualBrowserCaptures,
} from './support/legacy-visual-metadata';

const CALIBRATION_PATH =
  'tests/baselines/legacy/visual-calibration.json';
const MANIFEST_PATH = 'tests/baselines/legacy/manifest.json';

function readJson(path: string): unknown {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), path), 'utf8'),
  ) as unknown;
}

function readCalibration(): unknown {
  return readJson(CALIBRATION_PATH);
}

function readManifest(): unknown {
  return readJson(MANIFEST_PATH);
}

function readDeclaredBrowserCaptures(
  metadata: LegacyVisualGateMetadata,
): unknown[] {
  return metadata.artifacts.browserMetadata.map(
    ({ devicePixelRatio, path }) => ({
      devicePixelRatio,
      value: readJson(path),
    }),
  );
}

function expectGateError(
  calibration: unknown,
  manifest: unknown,
  message: string,
): void {
  expect(() => parseLegacyVisualGateMetadata(calibration, manifest))
    .toThrow(message);
}

function expectRecord(
  value: unknown,
): asserts value is Record<string, unknown> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBe(false);
}

function expectArray(value: unknown): asserts value is unknown[] {
  expect(Array.isArray(value)).toBe(true);
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  expectArray(value);
  return value.map((entry) => {
    expectRecord(entry);
    return entry;
  });
}

function readCalibrationBrowser(
  calibration: unknown,
  index = 0,
): Record<string, unknown> {
  expectRecord(calibration);
  const browser = readRecordArray(calibration.browsers)[index];
  if (!browser) throw new Error(`Calibration browser ${index} is missing.`);
  return browser;
}

function readFirstCalibrationScenario(
  calibration: unknown,
): Record<string, unknown> {
  const browser = readCalibrationBrowser(calibration);
  const scenario = readRecordArray(browser.scenarios)[0];
  if (!scenario) throw new Error('First calibration scenario is missing.');
  return scenario;
}

function createReadinessArtifacts(): {
  calibration: unknown;
  manifest: unknown;
} {
  const calibration = readCalibration();
  const manifest = readManifest();
  expectRecord(calibration);
  expectRecord(calibration.comparison);
  calibration.schemaVersion = 3;
  calibration.comparison.publicUniformCanvasReadiness = {
    minimumNonTransparentPixels: 1000,
    stability: {
      consecutiveFrames: 3,
      fingerprint: 'SHA-256 RGBA',
      sampling: 'requestAnimationFrame',
    },
    trigger: 'window-resize',
  };

  for (const browser of readRecordArray(calibration.browsers)) {
    for (const scenario of readRecordArray(browser.scenarios)) {
      const publicCanvas = readRecordArray(scenario.canvasDimensions).find(
        ({ className }) => className === 'liquid-glass-uniform-canvas',
      );
      if (!publicCanvas) {
        throw new Error('Synthetic readiness fixture lacks a public canvas.');
      }
      const { height, width } = publicCanvas;
      if (
        typeof height !== 'number'
        || typeof width !== 'number'
        || !Number.isInteger(height)
        || !Number.isInteger(width)
      ) {
        throw new Error('Synthetic public canvas dimensions are invalid.');
      }
      scenario.publicUniformCanvas = {
        classNames: ['liquid-glass-uniform-canvas'],
        height,
        nonTransparentPixels: 1001,
        width,
      };
    }
  }

  expectRecord(manifest);
  expectRecord(manifest.browserEvidence);
  manifest.schemaVersion = 3;
  manifest.browserEvidence.publicUniformCanvasReadiness = {
    minimumNonTransparentPixels: 1000,
    minimumObservedNonTransparentPixels: 1001,
    stability: {
      consecutiveFrames: 3,
      fingerprint: 'SHA-256 RGBA',
      sampling: 'requestAnimationFrame',
    },
    trigger: 'window-resize',
  };
  return { calibration, manifest };
}

test.describe('legacy visual metadata schema', () => {
  test('accepts exact schema v3 public uniform canvas readiness', () => {
    const { calibration, manifest } = createReadinessArtifacts();
    const metadata = parseLegacyVisualGateMetadata(calibration, manifest);

    expect(metadata.publicUniformCanvasReadiness).toEqual({
      minimumNonTransparentPixels: 1000,
      minimumObservedNonTransparentPixels: 1001,
      stability: {
        consecutiveFrames: 3,
        fingerprint: 'SHA-256 RGBA',
        sampling: 'requestAnimationFrame',
      },
      trigger: 'window-resize',
    });
    expect(metadata.calibrations.every(
      (entry) => entry.publicUniformCanvas.nonTransparentPixels > 1000,
    )).toBe(true);
  });

  test('rejects a transparent or nearly transparent public uniform canvas', () => {
    const { calibration, manifest } = createReadinessArtifacts();
    const scenario = readFirstCalibrationScenario(calibration);
    expectRecord(scenario.publicUniformCanvas);
    scenario.publicUniformCanvas.nonTransparentPixels = 1000;

    expectGateError(
      calibration,
      manifest,
      'publicUniformCanvas.nonTransparentPixels must exceed 1000.',
    );
  });

  test('rejects manifest public canvas readiness summary drift', () => {
    const { calibration, manifest } = createReadinessArtifacts();
    expectRecord(manifest);
    expectRecord(manifest.browserEvidence);
    expectRecord(
      manifest.browserEvidence.publicUniformCanvasReadiness,
    );
    manifest.browserEvidence.publicUniformCanvasReadiness
      .minimumObservedNonTransparentPixels = 1002;

    expectGateError(
      calibration,
      manifest,
      'Calibration public canvas observed minimum does not match the manifest.',
    );
  });

  test('rejects public canvas dimensions that drift from scene metadata', () => {
    const { calibration, manifest } = createReadinessArtifacts();
    const scenario = readFirstCalibrationScenario(calibration);
    const publicCanvas = readRecordArray(scenario.canvasDimensions)[0];
    if (!publicCanvas) {
      throw new Error('Synthetic public canvas metadata is missing.');
    }
    const width = publicCanvas.width;
    if (typeof width !== 'number') {
      throw new Error('Synthetic public canvas width is invalid.');
    }
    publicCanvas.width = width + 1;

    expectGateError(
      calibration,
      manifest,
      'canvasDimensions public uniform canvas dimensions do not match readiness.',
    );
  });

  test('accepts the committed calibration and manifest as one consistent gate', () => {
    const metadata = parseLegacyVisualGateMetadata(
      readCalibration(),
      readManifest(),
    );
    const captures = validateLegacyVisualBrowserCaptures(
      metadata,
      readDeclaredBrowserCaptures(metadata),
    );

    expect(metadata.oracleCommit).toBe(
      '345a9be6906bcc8a801208054e7fe134c6bfe641',
    );
    expect(metadata.browserName).toBe('Google Chrome');
    expect(metadata.browserVersion).toBe('150.0.7871.129');
    expect(metadata.userAgent).toContain('HeadlessChrome/150.');
    expect(captures.map((capture) => capture.devicePixelRatio)).toEqual([1, 2]);
    expect(metadata.devicePixelRatios).toEqual([1, 2]);
    expect(metadata.scenarioIds).toEqual([
      'S001',
      'S002',
      'S003',
      'S004',
      'S005',
      'S006',
    ]);
    expect(metadata.calibrations).toHaveLength(12);
    expect(metadata.calibrations.every(
      (entry) => entry.materialRectangles.length > 0,
    )).toBe(true);
  });

  test('rejects malformed calibration browser identity fields explicitly', () => {
    const cases = [
      ['browserName', 'Chromium',
        'calibration.browsers[0].browserName must be Google Chrome.'],
      ['browserVersion', '150',
        'calibration.browsers[0].browserVersion must be a four-part numeric version.'],
      ['userAgent', 'Mozilla/5.0 HeadlessChrome/149.0.0.0',
        'calibration.browsers[0].userAgent Chrome major version must match browserVersion.'],
    ] as const;

    for (const [field, value, error] of cases) {
      const calibration = readCalibration();
      readCalibrationBrowser(calibration)[field] = value;
      expectGateError(calibration, readManifest(), error);
    }
  });

  test('rejects identity drift between calibration and manifest', () => {
    const calibration = readCalibration();
    const driftedUserAgent =
      'Mozilla/5.0 HeadlessChrome/150.0.0.0 Drift';
    readCalibrationBrowser(calibration, 1).userAgent = driftedUserAgent;
    expectRecord(calibration);
    expectRecord(calibration.captureEvidence);
    const captureBrowser = readRecordArray(
      calibration.captureEvidence.browsers,
    )[1];
    if (!captureBrowser) {
      throw new Error('Second calibration capture browser is missing.');
    }
    captureBrowser.userAgent = driftedUserAgent;

    expectGateError(
      calibration,
      readManifest(),
      'Calibration DPR 2 userAgent does not match the manifest.',
    );
  });

  test('binds calibration output to one complete capture invocation', () => {
    const calibration = readCalibration();
    expectRecord(calibration);
    expectRecord(calibration.captureEvidence);
    calibration.captureEvidence.captureId = 'stale';

    expectGateError(
      calibration,
      readManifest(),
      'calibration.captureEvidence.captureId has an invalid format.',
    );

    const incomplete = readCalibration();
    expectRecord(incomplete);
    expectRecord(incomplete.captureEvidence);
    expectArray(incomplete.captureEvidence.capturedDevicePixelRatios);
    incomplete.captureEvidence.capturedDevicePixelRatios.pop();
    expectGateError(
      incomplete,
      readManifest(),
      'Calibration capture DPR values do not match calibration browsers.',
    );

    const runtimeError = readCalibration();
    expectRecord(runtimeError);
    expectRecord(runtimeError.captureEvidence);
    const summary = readRecordArray(runtimeError.captureEvidence.browsers)[0];
    if (!summary) throw new Error('Calibration capture summary is missing.');
    summary.runtimeErrorCount = 1;
    expectGateError(
      runtimeError,
      readManifest(),
      'calibration.captureEvidence.browsers[0].runtimeErrorCount must be zero.',
    );

    const driftedContract = readCalibration();
    expectRecord(driftedContract);
    expectRecord(driftedContract.captureEvidence);
    driftedContract.captureEvidence.contractSha256 = '0'.repeat(64);
    expectGateError(
      driftedContract,
      readManifest(),
      'calibration.captureEvidence.contractSha256 does not match contract.',
    );

    const driftedManifest = readManifest();
    expectRecord(driftedManifest);
    expectRecord(driftedManifest.browserEvidence);
    driftedManifest.browserEvidence.captureContractSha256 = '0'.repeat(64);
    expectGateError(
      readCalibration(),
      driftedManifest,
      'Calibration capture contract does not match the manifest.',
    );
  });

  test('reproduces every committed glass-on versus glass-off metric', () => {
    const metadata = parseLegacyVisualGateMetadata(
      readCalibration(),
      readManifest(),
    );

    for (const calibration of metadata.calibrations) {
      const baselineRoot = resolve(
        process.cwd(),
        'tests/baselines/legacy/visual',
        `dpr-${calibration.devicePixelRatio}`,
      );
      const metrics = compareLegacyMaskedPngPixels(
        readFileSync(resolve(
          baselineRoot,
          `${calibration.scenarioId}-glass-on.png`,
        )),
        readFileSync(resolve(
          baselineRoot,
          `${calibration.scenarioId}-glass-off.png`,
        )),
        calibration.materialRectangles,
        calibration.devicePixelRatio,
      );

      expect(metrics.changedPixels)
        .toBe(calibration.glassOnVersusOff.changedPixels);
      expect(metrics.comparedPixels)
        .toBe(calibration.glassOnVersusOff.comparedPixels);
      expect(metrics.diffRatio)
        .toBeCloseTo(calibration.glassOnVersusOff.diffRatio, 11);
      expect(metrics.meanAbsoluteChannelDelta).toBeCloseTo(
        calibration.glassOnVersusOff.meanAbsoluteChannelDelta,
        5,
      );
      expect(metrics.maxChannelDelta)
        .toBe(calibration.glassOnVersusOff.maxChannelDelta);
    }
  });

  test('rejects comparison-policy drift in the calibration schema', () => {
    const calibration = readCalibration();
    expectRecord(calibration);
    const comparison = calibration.comparison;
    expectRecord(comparison);
    comparison.ignoredChannelDeltaAtOrBelow = 4;

    expectGateError(
      calibration,
      readManifest(),
      'calibration.comparison.ignoredChannelDeltaAtOrBelow must be 3.',
    );
  });

  test('rejects a raised calibration threshold cap', () => {
    const calibration = readCalibration();
    expectRecord(calibration);
    const comparison = calibration.comparison;
    expectRecord(comparison);
    comparison.thresholdCap = 0.006;

    expectGateError(
      calibration,
      readManifest(),
      'calibration.comparison.thresholdCap must be 0.005.',
    );
  });

  test('rejects a scene threshold that was not derived from self-diff', () => {
    const calibration = readCalibration();
    const scenario = readFirstCalibrationScenario(calibration);
    const selfDiff = scenario.selfDiff;
    expectRecord(selfDiff);
    selfDiff.threshold = 0.002;

    expectGateError(
      calibration,
      readManifest(),
      'selfDiff.threshold does not match the calibrated formula.',
    );
  });

  test('rejects a missing self-diff run', () => {
    const calibration = readCalibration();
    const scenario = readFirstCalibrationScenario(calibration);
    const selfDiff = scenario.selfDiff;
    expectRecord(selfDiff);
    const runs = selfDiff.runs;
    expectArray(runs);
    runs.pop();

    expectGateError(
      calibration,
      readManifest(),
      'selfDiff.runs must contain 19 entries.',
    );
  });

  test('rejects viewport drift between calibration and manifest', () => {
    const manifest = readManifest();
    expectRecord(manifest);
    const evidence = manifest.browserEvidence;
    expectRecord(evidence);
    const viewport = evidence.viewport;
    expectRecord(viewport);
    viewport.width = 1439;
    const screenshotDimensions = evidence.screenshotDimensions;
    expectRecord(screenshotDimensions);
    const dpr1 = screenshotDimensions.dpr1;
    const dpr2 = screenshotDimensions.dpr2;
    expectRecord(dpr1);
    expectRecord(dpr2);
    dpr1.width = 1439;
    dpr2.width = 2878;

    expectGateError(
      readCalibration(),
      manifest,
      'Capture contract context does not match the manifest.',
    );
  });

  test('rejects calibration data from a different oracle commit', () => {
    const manifest = readManifest();
    expectRecord(manifest);
    const oracle = manifest.oracle;
    expectRecord(oracle);
    oracle.commit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    expectGateError(
      readCalibration(),
      manifest,
      'Calibration source commit does not match the manifest oracle.',
    );
  });

  test('rejects a jointly reduced calibration run count', () => {
    const calibration = readCalibration();
    expectRecord(calibration);
    expectRecord(calibration.comparison);
    calibration.comparison.runCount = 2;

    expectGateError(
      calibration,
      readManifest(),
      'calibration.comparison.runCount must be 20.',
    );
  });
});
