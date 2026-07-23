import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

import { expect, test } from '@playwright/test';

import {
  compareLegacyMaskedPngPixels,
  compareLegacyRgbPixels,
  createLegacyMaterialMask,
  type LegacyRgbaImage,
} from './support/legacy-visual-comparator';
import {
  parseLegacyVisualGateMetadata,
} from './support/legacy-visual-metadata';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([
    length,
    Buffer.from(type, 'ascii'),
    data,
    Buffer.alloc(4),
  ]);
}

function encodeRgbaPng(
  width: number,
  height: number,
  pixels: readonly number[],
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    rows[rowOffset] = 0;
    for (let x = 0; x < width * 4; x += 1) {
      rows[rowOffset + x + 1] = pixels[y * width * 4 + x] ?? 0;
    }
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk('IHDR', header),
    createChunk('IDAT', deflateSync(rows)),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createImage(
  width: number,
  height: number,
  pixels: readonly number[],
): LegacyRgbaImage {
  return { width, height, pixels: Uint8Array.from(pixels) };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as unknown;
}

function expectRecord(value: unknown): asserts value is Record<string, unknown> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBe(false);
}

function expectArray(value: unknown): asserts value is unknown[] {
  expect(Array.isArray(value)).toBe(true);
}

function readFirstCalibrationScenario(
  calibration: unknown,
): Record<string, unknown> {
  expectRecord(calibration);
  const browsers = calibration.browsers;
  expectArray(browsers);
  const browser = browsers[0];
  expectRecord(browser);
  const scenarios = browser.scenarios;
  expectArray(scenarios);
  const scenario = scenarios[0];
  expectRecord(scenario);
  return scenario;
}

test.describe('legacy visual comparison support', () => {
  test('uses RGB only and changes a pixel only above the legacy noise floor', () => {
    const reference = createImage(2, 1, [
      10, 20, 30, 0,
      40, 50, 60, 0,
    ]);
    const candidate = createImage(2, 1, [
      13, 17, 33, 255,
      44, 50, 60, 255,
    ]);

    expect(compareLegacyRgbPixels(reference, candidate)).toEqual({
      changedPixels: 1,
      comparedPixels: 2,
      diffRatio: 0.5,
      meanAbsoluteChannelDelta: 13 / 6,
      maxChannelDelta: 4,
    });
  });

  test('creates the union of clipped CSS rectangles with DPR floor and ceil edges', () => {
    const image = createImage(5, 4, new Array(5 * 4 * 4).fill(0));
    const mask = createLegacyMaterialMask(image, [
      {
        id: 'first',
        rect: { left: 0.75, top: 0.5, right: 1.25, bottom: 1.01 },
      },
      {
        id: 'second',
        rect: { left: 1, top: 1, right: 2, bottom: 1.5 },
      },
      {
        id: 'clipped',
        rect: { left: -2, top: -2, right: 0.25, bottom: 0.25 },
      },
    ], 2);

    expect(Array.from(mask)).toEqual([
      1, 0, 0, 0, 0,
      0, 1, 1, 0, 0,
      0, 1, 1, 1, 0,
      0, 0, 0, 0, 0,
    ]);
  });

  test('decodes full PNGs before applying the material-region comparison', () => {
    const reference = encodeRgbaPng(3, 2, new Array(3 * 2 * 4).fill(0));
    const candidatePixels = new Array(3 * 2 * 4).fill(0);
    for (let index = 0; index < candidatePixels.length; index += 4) {
      candidatePixels[index] = 4;
      candidatePixels[index + 3] = 255;
    }
    const candidate = encodeRgbaPng(3, 2, candidatePixels);

    expect(compareLegacyMaskedPngPixels(reference, candidate, [
      {
        id: 'material',
        rect: { left: 0.5, top: 0, right: 1.25, bottom: 1 },
      },
    ], 2)).toEqual({
      changedPixels: 4,
      comparedPixels: 4,
      diffRatio: 1,
      meanAbsoluteChannelDelta: 4 / 3,
      maxChannelDelta: 4,
    });
  });

  test('rejects incompatible PNG dimensions and invalid material schemas', () => {
    const onePixel = encodeRgbaPng(1, 1, [0, 0, 0, 255]);
    const twoPixels = encodeRgbaPng(2, 1, [
      0, 0, 0, 255,
      0, 0, 0, 255,
    ]);

    expect(() => compareLegacyMaskedPngPixels(
      onePixel,
      twoPixels,
      [],
      1,
    )).toThrow('Compared images dimensions differ: 1x1 versus 2x1.');
    expect(() => createLegacyMaterialMask(
      createImage(1, 1, [0, 0, 0, 255]),
      [{
        id: 'invalid',
        rect: { left: 1, top: 0, right: 0, bottom: 1 },
      }],
      1,
    )).toThrow('materialRectangles[0].rect.right must be at least left.');
  });
});

test.describe('legacy visual metadata schema', () => {
  test('accepts the committed calibration and manifest as one consistent gate', () => {
    const metadata = parseLegacyVisualGateMetadata(
      readJson('tests/baselines/legacy/visual-calibration.json'),
      readJson('tests/baselines/legacy/manifest.json'),
    );

    expect(metadata.oracleCommit).toBe(
      '345a9be6906bcc8a801208054e7fe134c6bfe641',
    );
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

  test('reproduces every committed glass-on versus glass-off metric', () => {
    const metadata = parseLegacyVisualGateMetadata(
      readJson('tests/baselines/legacy/visual-calibration.json'),
      readJson('tests/baselines/legacy/manifest.json'),
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

      expect(metrics.changedPixels).toBe(
        calibration.glassOnVersusOff.changedPixels,
      );
      expect(metrics.comparedPixels).toBe(
        calibration.glassOnVersusOff.comparedPixels,
      );
      expect(metrics.diffRatio).toBeCloseTo(
        calibration.glassOnVersusOff.diffRatio,
        11,
      );
      expect(metrics.meanAbsoluteChannelDelta).toBeCloseTo(
        calibration.glassOnVersusOff.meanAbsoluteChannelDelta,
        5,
      );
      expect(metrics.maxChannelDelta).toBe(
        calibration.glassOnVersusOff.maxChannelDelta,
      );
    }
  });

  test('rejects comparison-policy drift in the calibration schema', () => {
    const calibration = readJson(
      'tests/baselines/legacy/visual-calibration.json',
    );
    expectRecord(calibration);
    const comparison = calibration.comparison;
    expectRecord(comparison);
    comparison.ignoredChannelDeltaAtOrBelow = 4;

    expect(() => parseLegacyVisualGateMetadata(
      calibration,
      readJson('tests/baselines/legacy/manifest.json'),
    )).toThrow('calibration.comparison.ignoredChannelDeltaAtOrBelow must be 3.');
  });

  test('rejects a raised calibration threshold cap', () => {
    const calibration = readJson(
      'tests/baselines/legacy/visual-calibration.json',
    );
    expectRecord(calibration);
    const comparison = calibration.comparison;
    expectRecord(comparison);
    comparison.thresholdCap = 0.006;

    expect(() => parseLegacyVisualGateMetadata(
      calibration,
      readJson('tests/baselines/legacy/manifest.json'),
    )).toThrow('calibration.comparison.thresholdCap must be 0.005.');
  });

  test('rejects a scene threshold that was not derived from self-diff', () => {
    const calibration = readJson(
      'tests/baselines/legacy/visual-calibration.json',
    );
    const scenario = readFirstCalibrationScenario(calibration);
    const selfDiff = scenario.selfDiff;
    expectRecord(selfDiff);
    selfDiff.threshold = 0.002;

    expect(() => parseLegacyVisualGateMetadata(
      calibration,
      readJson('tests/baselines/legacy/manifest.json'),
    )).toThrow('selfDiff.threshold does not match the calibrated formula.');
  });

  test('rejects a missing self-diff run', () => {
    const calibration = readJson(
      'tests/baselines/legacy/visual-calibration.json',
    );
    const scenario = readFirstCalibrationScenario(calibration);
    const selfDiff = scenario.selfDiff;
    expectRecord(selfDiff);
    const runs = selfDiff.runs;
    expectArray(runs);
    runs.pop();

    expect(() => parseLegacyVisualGateMetadata(
      calibration,
      readJson('tests/baselines/legacy/manifest.json'),
    )).toThrow('selfDiff.runs must contain 19 entries.');
  });

  test('rejects viewport drift between calibration and manifest', () => {
    const manifest = readJson('tests/baselines/legacy/manifest.json');
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

    expect(() => parseLegacyVisualGateMetadata(
      readJson('tests/baselines/legacy/visual-calibration.json'),
      manifest,
    )).toThrow('Calibration DPR 1 viewport does not match the manifest.');
  });

  test('rejects calibration data from a different oracle commit', () => {
    const manifest = readJson('tests/baselines/legacy/manifest.json');
    expectRecord(manifest);
    const oracle = manifest.oracle;
    expectRecord(oracle);
    oracle.commit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    expect(() => parseLegacyVisualGateMetadata(
      readJson('tests/baselines/legacy/visual-calibration.json'),
      manifest,
    )).toThrow('Calibration source commit does not match the manifest oracle.');
  });
});
