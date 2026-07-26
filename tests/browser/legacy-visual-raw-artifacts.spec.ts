import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  compareLegacyRawCanvasPngPixels,
} from './support/legacy-visual-canvas-comparator';
import {
  parseLegacyVisualGateMetadata,
} from './support/legacy-visual-metadata';

const CALIBRATION_PATH =
  'tests/baselines/legacy/visual-calibration.json';
const MANIFEST_PATH = 'tests/baselines/legacy/manifest.json';

function readJson(path: string): unknown {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), path), 'utf8'),
  ) as unknown;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
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

function readFirstRawArtifact(
  calibration: unknown,
): Record<string, unknown> {
  expectRecord(calibration);
  expectArray(calibration.browsers);
  const browser = calibration.browsers[0];
  expectRecord(browser);
  expectArray(browser.scenarios);
  const scenario = browser.scenarios[0];
  expectRecord(scenario);
  expectRecord(scenario.rawPublicCanvas);
  return scenario.rawPublicCanvas;
}

function expectGateError(
  mutate: (
    calibration: unknown,
    manifest: unknown,
  ) => void,
  message: string,
): void {
  const calibration = readJson(CALIBRATION_PATH);
  const manifest = readJson(MANIFEST_PATH);
  mutate(calibration, manifest);
  expect(() => parseLegacyVisualGateMetadata(calibration, manifest))
    .toThrow(message);
}

test.describe('legacy raw public-canvas artifacts', () => {
  test('binds every committed PNG to its calibrated digest and alpha evidence', () => {
    const metadata = parseLegacyVisualGateMetadata(
      readJson(CALIBRATION_PATH),
      readJson(MANIFEST_PATH),
    );

    for (const calibration of metadata.calibrations) {
      const png = readFileSync(resolve(
        process.cwd(),
        calibration.rawPublicCanvas.artifactPath,
      ));
      const comparison = compareLegacyRawCanvasPngPixels(png, png);

      expect(comparison.referenceVisiblePixels)
        .toBe(calibration.rawPublicCanvas.nonTransparentPixels);
      expect(comparison.candidateVisiblePixels)
        .toBe(calibration.rawPublicCanvas.nonTransparentPixels);
      expect(comparison.difference.changedPixels).toBe(0);
      expect(sha256(png)).toBe(calibration.rawPublicCanvas.sha256);

      for (const artifact of [
        calibration.screenshotArtifacts.glassOff,
        calibration.screenshotArtifacts.glassOn,
      ]) {
        expect(sha256(readFileSync(resolve(
          process.cwd(),
          artifact.artifactPath,
        )))).toBe(artifact.sha256);
      }
    }
  });

  test('rejects artifact path and capture provenance drift', () => {
    const cases = [
      [
        'artifactPath',
        'tests/baselines/legacy/visual/dpr-2/S001-canvas.png',
        'rawPublicCanvas.artifactPath must be '
        + 'tests/baselines/legacy/visual/dpr-1/S001-canvas.png.',
      ],
      [
        'captureRun',
        2,
        'rawPublicCanvas.captureRun must be 1.',
      ],
      [
        'sha256',
        'not-a-sha256',
        'rawPublicCanvas.sha256 must be a lowercase SHA-256.',
      ],
      [
        'selector',
        'canvas',
        'rawPublicCanvas.selector must be '
        + 'canvas.liquid-glass-uniform-canvas.',
      ],
      [
        'serialization',
        'locator.screenshot',
        'rawPublicCanvas.serialization must be '
        + 'HTMLCanvasElement.toDataURL("image/png").',
      ],
      [
        'transfer',
        'filesystem copy',
        'rawPublicCanvas.transfer must be Playwright Download.saveAs.',
      ],
    ] as const;

    for (const [field, value, message] of cases) {
      expectGateError((calibration) => {
        readFirstRawArtifact(calibration)[field] = value;
      }, message);
    }
  });

  test('rejects raw dimensions or alpha counts outside the canvas contract', () => {
    expectGateError((calibration) => {
      const artifact = readFirstRawArtifact(calibration);
      const width = artifact.width;
      if (typeof width !== 'number') throw new Error('Raw width is invalid.');
      artifact.width = width + 1;
    }, 'rawPublicCanvas dimensions do not match the public canvas.');

    expectGateError((calibration) => {
      readFirstRawArtifact(calibration).nonTransparentPixels = 1000;
    }, 'rawPublicCanvas.nonTransparentPixels is outside the valid area.');
  });

  test('rejects unsupported manifest artifact paths and templates', () => {
    const cases = [
      [
        'rawPublicCanvases',
        'tests/baselines/legacy/visual/*.png',
        'manifest.browserEvidence.artifacts.rawPublicCanvases is unsupported.',
      ],
      [
        'screenshots',
        'tests/baselines/legacy/visual/*.png',
        'manifest.browserEvidence.artifacts.screenshots is unsupported.',
      ],
      [
        'calibration',
        'tests/baselines/legacy/calibration.json',
        'manifest.browserEvidence.artifacts.calibration is unsupported.',
      ],
      [
        'dpr1Metadata',
        'tests/baselines/legacy/visual/browser.json',
        'manifest.browserEvidence.artifacts.dpr1Metadata is unsupported.',
      ],
    ] as const;

    for (const [field, value, message] of cases) {
      expectGateError((_calibration, manifest) => {
        expectRecord(manifest);
        expectRecord(manifest.browserEvidence);
        expectRecord(manifest.browserEvidence.artifacts);
        manifest.browserEvidence.artifacts[field] = value;
      }, message);
    }
  });
});
