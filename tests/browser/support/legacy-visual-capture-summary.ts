import {
  type LegacyVisualBrowserIdentity,
  parseLegacyVisualBrowserIdentity,
} from './legacy-visual-manifest';
import {
  computeLegacyVisualCanonicalSha256,
  type LegacyVisualProvenanceContract,
  parseLegacyVisualProvenanceContract,
  parseLegacyVisualSha256,
} from './legacy-visual-provenance';
import {
  type LegacyVisualDimensions,
} from './legacy-visual-scenario';
import {
  assertUnique,
  expectRecord,
  haveSameValues,
  readArray,
  readPositiveInteger,
  readString,
} from './legacy-visual-schema';
import {
  haveSameLegacyVisualWebGlFingerprint,
  type LegacyVisualWebGlFingerprint,
  parseLegacyVisualWebGlFingerprint,
} from './legacy-visual-webgl';

const CAPTURE_ID_PATTERN = /^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$/u;

interface ExpectedCalibrationBrowser
  extends LegacyVisualBrowserIdentity {
  devicePixelRatio: number;
  viewport: LegacyVisualDimensions;
  webGlFingerprint: LegacyVisualWebGlFingerprint;
}

/** Browser summary preserved by one full legacy calibration capture. */
export interface LegacyVisualCaptureBrowserSummary
  extends LegacyVisualBrowserIdentity {
  /** ISO timestamp emitted by the matching browser capture. */
  capturedAt: string;
  /** DPR represented by this browser capture. */
  devicePixelRatio: number;
  /** Runtime errors observed while capturing this DPR. */
  runtimeErrorCount: 0;
  /** CSS viewport used by the browser capture. */
  viewport: LegacyVisualDimensions;
  /** Exact SwiftShader WebGL2 identity used by the capture. */
  webGlFingerprint: LegacyVisualWebGlFingerprint;
}

/** Provenance tying a calibration report to one complete capture invocation. */
export interface LegacyVisualCalibrationCaptureSummary {
  /** Browser evidence for every captured DPR. */
  browsers: readonly LegacyVisualCaptureBrowserSummary[];
  /** Unique full-capture invocation identifier. */
  captureId: string;
  /** Only full captures can produce committed baselines. */
  captureMode: 'full';
  /** Complete immutable capture environment and toolchain contract. */
  contract: LegacyVisualProvenanceContract;
  /** Canonical SHA-256 identity of the complete contract. */
  contractSha256: string;
  /** DPR values produced by the capture invocation. */
  capturedDevicePixelRatios: readonly number[];
}

function parseViewport(
  value: unknown,
  label: string,
): LegacyVisualDimensions {
  expectRecord(value, label);
  return {
    height: readPositiveInteger(value.height, `${label}.height`),
    width: readPositiveInteger(value.width, `${label}.width`),
  };
}

/**
 * Parse calibration-level capture provenance and bind it to browser entries.
 */
export function parseLegacyVisualCalibrationCaptureSummary(
  value: unknown,
  calibrationBrowsers: readonly ExpectedCalibrationBrowser[],
): LegacyVisualCalibrationCaptureSummary {
  expectRecord(value, 'calibration.captureEvidence');
  const contract = parseLegacyVisualProvenanceContract(
    value.contract,
    'calibration.captureEvidence.contract',
  );
  const contractSha256 = parseLegacyVisualSha256(
    value.contractSha256,
    'calibration.captureEvidence.contractSha256',
  );
  if (computeLegacyVisualCanonicalSha256(contract) !== contractSha256) {
    throw new Error(
      'calibration.captureEvidence.contractSha256 does not match contract.',
    );
  }
  const captureId = readString(
    value.captureId,
    'calibration.captureEvidence.captureId',
  );
  if (!CAPTURE_ID_PATTERN.test(captureId)) {
    throw new Error(
      'calibration.captureEvidence.captureId has an invalid format.',
    );
  }
  if (value.captureMode !== 'full') {
    throw new Error('calibration.captureEvidence.captureMode must be full.');
  }
  const capturedDevicePixelRatios = readArray(
    value.capturedDevicePixelRatios,
    'calibration.captureEvidence.capturedDevicePixelRatios',
  ).map((entry, index) => readPositiveInteger(
    entry,
    `calibration.captureEvidence.capturedDevicePixelRatios[${index}]`,
  ));
  assertUnique(
    capturedDevicePixelRatios,
    'calibration.captureEvidence captured DPR values',
  );
  if (!haveSameValues(
    capturedDevicePixelRatios,
    calibrationBrowsers.map((browser) => browser.devicePixelRatio),
  )) {
    throw new Error(
      'Calibration capture DPR values do not match calibration browsers.',
    );
  }

  const browsers = readArray(
    value.browsers,
    'calibration.captureEvidence.browsers',
  ).map((browserValue, index): LegacyVisualCaptureBrowserSummary => {
    const label = `calibration.captureEvidence.browsers[${index}]`;
    expectRecord(browserValue, label);
    const identity = parseLegacyVisualBrowserIdentity(browserValue, label);
    const devicePixelRatio = readPositiveInteger(
      browserValue.devicePixelRatio,
      `${label}.devicePixelRatio`,
    );
    const expected = calibrationBrowsers.find(
      (browser) => browser.devicePixelRatio === devicePixelRatio,
    );
    if (!expected) {
      throw new Error(
        `${label}.devicePixelRatio is not present in calibration browsers.`,
      );
    }
    const capturedAt = readString(
      browserValue.capturedAt,
      `${label}.capturedAt`,
    );
    if (Number.isNaN(Date.parse(capturedAt))) {
      throw new Error(`${label}.capturedAt must be an ISO timestamp.`);
    }
    if (browserValue.runtimeErrorCount !== 0) {
      throw new Error(`${label}.runtimeErrorCount must be zero.`);
    }
    const viewport = parseViewport(browserValue.viewport, `${label}.viewport`);
    const webGlFingerprint = parseLegacyVisualWebGlFingerprint(
      browserValue.webGlFingerprint,
      `${label}.webGlFingerprint`,
    );
    for (const field of [
      'browserName',
      'browserVersion',
      'userAgent',
    ] as const) {
      if (identity[field] !== expected[field]) {
        throw new Error(
          `${label}.${field} does not match calibration browser evidence.`,
        );
      }
    }
    if (
      viewport.width !== expected.viewport.width
      || viewport.height !== expected.viewport.height
    ) {
      throw new Error(
        `${label}.viewport does not match calibration browser evidence.`,
      );
    }
    if (!haveSameLegacyVisualWebGlFingerprint(
      webGlFingerprint,
      expected.webGlFingerprint,
    )) {
      throw new Error(
        `${label}.webGlFingerprint does not match calibration browser evidence.`,
      );
    }
    return {
      ...identity,
      capturedAt,
      devicePixelRatio,
      runtimeErrorCount: 0,
      viewport,
      webGlFingerprint,
    };
  });
  assertUnique(
    browsers.map((browser) => browser.devicePixelRatio),
    'calibration capture browser DPR values',
  );
  if (!haveSameValues(
    browsers.map((browser) => browser.devicePixelRatio),
    capturedDevicePixelRatios,
  )) {
    throw new Error(
      'Calibration capture browser summaries do not cover captured DPR values.',
    );
  }
  return {
    browsers,
    captureId,
    captureMode: 'full',
    contract,
    contractSha256,
    capturedDevicePixelRatios,
  };
}
