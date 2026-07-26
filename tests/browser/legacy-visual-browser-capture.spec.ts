import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  type LegacyVisualGateMetadata,
  parseLegacyVisualGateMetadata,
  validateLegacyVisualBrowserCaptures,
} from './support/legacy-visual-metadata';

function readJson(path: string): unknown {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), path), 'utf8'),
  ) as unknown;
}

function expectRecord(
  value: unknown,
): asserts value is Record<string, unknown> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBe(false);
}

function readMetadata(): LegacyVisualGateMetadata {
  return parseLegacyVisualGateMetadata(
    readJson('tests/baselines/legacy/visual-calibration.json'),
    readJson('tests/baselines/legacy/manifest.json'),
  );
}

function readCaptures(
  metadata: LegacyVisualGateMetadata,
): Array<Record<string, unknown>> {
  return metadata.artifacts.browserMetadata.map(
    ({ devicePixelRatio, path }) => ({
      devicePixelRatio,
      value: readJson(path),
    }),
  );
}

function expectCaptureFailure(
  mutate: (capture: Record<string, unknown>) => void,
  message: string,
): void {
  const metadata = readMetadata();
  const captures = readCaptures(metadata);
  const firstCapture = captures[0];
  if (!firstCapture) throw new Error('DPR 1 browser capture is missing.');
  expectRecord(firstCapture.value);
  mutate(firstCapture.value);
  expect(() => validateLegacyVisualBrowserCaptures(metadata, captures))
    .toThrow(message);
}

test.describe('legacy visual browser capture evidence', () => {
  test('accepts one complete full capture for every declared DPR', () => {
    const metadata = readMetadata();
    const captures = validateLegacyVisualBrowserCaptures(
      metadata,
      readCaptures(metadata),
    );

    expect(captures.map((capture) => capture.devicePixelRatio)).toEqual([1, 2]);
    expect(new Set(captures.map((capture) => capture.captureId)).size).toBe(1);
    expect(captures.every((capture) => (
      capture.captureMode === 'full'
      && capture.sourceCommit === metadata.oracleCommit
      && capture.runCount === metadata.runCount
    ))).toBe(true);
  });

  test('rejects identity, provenance, viewport, and run-count drift', () => {
    const cases: ReadonlyArray<[
      string,
      unknown,
      string,
    ]> = [
      [
        'browserName',
        'Chromium',
        'browserCaptures[0].value.browserName must be Google Chrome.',
      ],
      [
        'browserVersion',
        '150.0.7871.130',
        'Browser capture DPR 1 browserVersion does not match the visual gate.',
      ],
      [
        'captureId',
        'stale',
        'browserCaptures[0].value.captureId has an invalid format.',
      ],
      [
        'captureMode',
        'glass-off',
        'browserCaptures[0].value.captureMode must be full.',
      ],
      [
        'captureContractSha256',
        '0'.repeat(64),
        'browserCaptures[0].value.captureContractSha256 does not match calibration evidence.',
      ],
      [
        'sourceCommit',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'browserCaptures[0].value.sourceCommit does not match the visual gate.',
      ],
      [
        'runCount',
        19,
        'browserCaptures[0].value.runCount does not match the visual gate.',
      ],
    ];
    for (const [field, value, message] of cases) {
      expectCaptureFailure((capture) => {
        capture[field] = value;
      }, message);
    }

    expectCaptureFailure((capture) => {
      expectRecord(capture.viewport);
      capture.viewport.width = 1_439;
    }, 'browserCaptures[0].value.viewport does not match the visual gate.');
  });

  test('rejects public canvas readiness stability drift', () => {
    expectCaptureFailure((capture) => {
      expectRecord(capture.publicUniformCanvasReadiness);
      expectRecord(capture.publicUniformCanvasReadiness.stability);
      capture.publicUniformCanvasReadiness.stability.consecutiveFrames = 4;
    }, [
      'browserCaptures[0].value.publicUniformCanvasReadiness.stability',
      'does not match the exact RGBA stability policy.',
    ].join(' '));
  });

  test('rejects actual capture-session environment drift', () => {
    expectCaptureFailure((capture) => {
      capture.effectiveBrowserArguments = ['--enable-automation'];
    }, [
      'browserCaptures[0].value browser protocol or effective arguments',
      'do not match the capture contract.',
    ].join(' '));

    expectCaptureFailure((capture) => {
      expectRecord(capture.browserProtocol);
      capture.browserProtocol.revision = '@drift';
    }, [
      'browserCaptures[0].value browser protocol or effective arguments',
      'do not match the capture contract.',
    ].join(' '));

    for (const [field, value] of [
      ['colorScheme', 'dark'],
      ['locale', 'fr-FR'],
      ['reducedMotion', 'no-preference'],
      ['timezoneId', 'Asia/Shanghai'],
    ]) {
      expectCaptureFailure((capture) => {
        capture[field] = value;
      }, [
        `browserCaptures[0].value.${field}`,
        'does not match the capture contract.',
      ].join(' '));
    }
  });

  test('rejects WebGL fingerprint drift', () => {
    expectCaptureFailure((capture) => {
      expectRecord(capture.webGlFingerprint);
      capture.webGlFingerprint.renderer = 'WebKit WebGL Drift';
    }, 'Browser capture DPR 1 WebGL fingerprint does not match the visual gate.');
  });

  test('rejects scenario state drift', () => {
    expectCaptureFailure((capture) => {
      if (!Array.isArray(capture.scenarios)) {
        throw new Error('Capture scenarios are invalid.');
      }
      expectRecord(capture.scenarios[4]);
      expectRecord(capture.scenarios[4].scenarioState);
      capture.scenarios[4].scenarioState.y = 421;
    }, [
      'browserCaptures[0].value.scenarios[4].scenarioState',
      'does not match the visual gate.',
    ].join(' '));
  });

  test('rejects incomplete DPR and scene coverage', () => {
    const metadata = readMetadata();
    expect(() => validateLegacyVisualBrowserCaptures(
      metadata,
      readCaptures(metadata).slice(0, 1),
    )).toThrow('Browser capture DPR values do not match the visual gate.');

    expectCaptureFailure((capture) => {
      if (!Array.isArray(capture.scenarios)) {
        throw new Error('Capture scenarios are invalid.');
      }
      capture.scenarios.pop();
    }, 'browserCaptures[0].value.scenarios do not match the visual gate.');

    const mixedMetadata = readMetadata();
    const mixedCaptures = readCaptures(mixedMetadata);
    const secondCapture = mixedCaptures[1];
    if (!secondCapture) throw new Error('DPR 2 browser capture is missing.');
    expectRecord(secondCapture.value);
    secondCapture.value.captureId = '20260723-220937-aaaaaaaa';
    expect(() => validateLegacyVisualBrowserCaptures(
      mixedMetadata,
      mixedCaptures,
    )).toThrow(
      'browserCaptures[1].value.captureId does not match calibration capture evidence.',
    );
  });

  test('rejects schema, declared DPR, raw evidence, and runtime errors', () => {
    expectCaptureFailure((capture) => {
      capture.schemaVersion = 1;
    }, 'browserCaptures[0].value.schemaVersion must be 3.');

    const metadata = readMetadata();
    const swapped = readCaptures(metadata);
    [swapped[0].value, swapped[1].value] = [
      swapped[1]?.value,
      swapped[0]?.value,
    ];
    expect(() => validateLegacyVisualBrowserCaptures(metadata, swapped))
      .toThrow(
        'browserCaptures[0].value declares DPR 1 but contains DPR 2.',
      );

    expectCaptureFailure((capture) => {
      if (!Array.isArray(capture.scenarios)) {
        throw new Error('Capture scenarios are invalid.');
      }
      expectRecord(capture.scenarios[0]);
      expectRecord(capture.scenarios[0].rawPublicCanvas);
      capture.scenarios[0].rawPublicCanvas.nonTransparentPixels = 1_001;
    }, 'rawPublicCanvas.nonTransparentPixels does not match the visual gate.');

    expectCaptureFailure((capture) => {
      if (!Array.isArray(capture.scenarios)) {
        throw new Error('Capture scenarios are invalid.');
      }
      expectRecord(capture.scenarios[0]);
      capture.scenarios[0].consoleErrors = [{
        errors: [{ kind: 'console', text: 'boom' }],
        run: 1,
      }];
    }, 'consoleErrors must not contain runtime errors.');
  });

  test('binds capture timestamps and scene geometry to calibration', () => {
    expectCaptureFailure((capture) => {
      capture.capturedAt = '2026-07-23T00:00:00.000Z';
    }, 'capturedAt does not match calibration capture evidence.');

    expectCaptureFailure((capture) => {
      if (!Array.isArray(capture.scenarios)) {
        throw new Error('Capture scenarios are invalid.');
      }
      expectRecord(capture.scenarios[0]);
      expectRecord(capture.scenarios[0].metadata);
      capture.scenarios[0].metadata.scrollY = 1;
    }, 'metadata.scrollY does not match the visual gate.');

    expectCaptureFailure((capture) => {
      if (!Array.isArray(capture.scenarios)) {
        throw new Error('Capture scenarios are invalid.');
      }
      expectRecord(capture.scenarios[0]);
      expectRecord(capture.scenarios[0].metadata);
      const materials = capture.scenarios[0].metadata.materials;
      if (!Array.isArray(materials)) {
        throw new Error('Capture materials are invalid.');
      }
      expectRecord(materials[0]);
      expectRecord(materials[0].rect);
      materials[0].rect.width = 1;
    }, 'metadata.materials[0].rect.width does not match the visual gate.');
  });
});
