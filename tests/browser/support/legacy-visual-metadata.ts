import {
  type LegacyVisualBrowserCaptureMetadata,
  parseLegacyVisualBrowserCapture,
} from './legacy-visual-browser-capture';
import {
  type LegacyVisualCalibrationCaptureSummary,
  parseLegacyVisualCalibrationCaptureSummary,
} from './legacy-visual-capture-summary';
import {
  LEGACY_CHANNEL_DELTA_THRESHOLD,
} from './legacy-visual-comparator';
import {
  LEGACY_VISUAL_RUN_COUNT,
  type LegacyVisualBrowserIdentity,
  parseLegacyVisualBrowserIdentity,
  parseLegacyVisualManifest,
} from './legacy-visual-manifest';
import {
  LEGACY_PUBLIC_UNIFORM_CANVAS_MIN_NON_TRANSPARENT_PIXELS,
  LEGACY_PUBLIC_UNIFORM_CANVAS_READINESS_TRIGGER,
  LEGACY_VISUAL_THRESHOLD_CAP,
  type LegacyPublicUniformCanvasStability,
  type LegacyVisualDimensions,
  type LegacyVisualSceneCalibration,
  parseLegacyPublicCanvasStability,
  parseLegacyVisualScenario,
} from './legacy-visual-scenario';
import {
  assertUnique,
  expectRecord,
  haveSameValues,
  readArray,
  readPositiveInteger,
  readRatio,
  readString,
} from './legacy-visual-schema';
import {
  haveSameLegacyVisualWebGlFingerprint,
  type LegacyVisualWebGlFingerprint,
  parseLegacyVisualWebGlFingerprint,
} from './legacy-visual-webgl';

const LEGACY_THRESHOLD_FORMULA =
  'min(0.005, max(0.001, 3 * maxSelfDiffRatio))';
const SHA_1_PATTERN = /^[a-f0-9]{40}$/u;

export type {
  LegacyVisualBrowserCaptureMetadata,
} from './legacy-visual-browser-capture';
export type {
  LegacyVisualSceneCalibration,
} from './legacy-visual-scenario';

/** Validated legacy metadata required to construct visual parity tests. */
export interface LegacyVisualGateMetadata
  extends LegacyVisualBrowserIdentity {
  /** Paths and templates locating the committed baseline artifacts. */
  artifacts: {
    /** Browser metadata files keyed by captured DPR. */
    browserMetadata: ReadonlyArray<{
      /** DPR represented by the metadata file. */
      devicePixelRatio: number;
      /** Repository-relative metadata path. */
      path: string;
    }>;
    /** Repository-relative calibration report path. */
    calibration: string;
    /** Repository-relative raw public-canvas path template. */
    rawPublicCanvases: string;
    /** Repository-relative screenshot path template. */
    screenshots: string;
  };
  /** Provenance tying every baseline artifact to one full capture. */
  captureEvidence: LegacyVisualCalibrationCaptureSummary;
  /** Flattened DPR-by-scene calibration entries. */
  calibrations: readonly LegacyVisualSceneCalibration[];
  /** DPR values represented by both the manifest and calibration report. */
  devicePixelRatios: readonly number[];
  /** Git commit from which every baseline was captured. */
  oracleCommit: string;
  /** Public uniform canvas readiness policy and observed minimum. */
  publicUniformCanvasReadiness: {
    /** Exclusive non-transparent pixel floor required by the capture. */
    minimumNonTransparentPixels: number;
    /** Smallest exact non-transparent count across every scene and DPR. */
    minimumObservedNonTransparentPixels: number;
    /** Exact frame-stability policy used before serialization. */
    stability: LegacyPublicUniformCanvasStability;
    /** Lifecycle trigger used before readiness polling. */
    trigger: string;
  };
  /** Number of legacy self-diff runs per scene and DPR. */
  runCount: number;
  /** Scenario identifiers represented at every calibrated DPR. */
  scenarioIds: readonly string[];
  /** CSS viewport shared by every capture. */
  viewport: LegacyVisualDimensions;
  /** Exact SwiftShader WebGL2 identity shared by every capture. */
  webGlFingerprint: LegacyVisualWebGlFingerprint;
}

interface ParsedCalibration {
  browsers: Array<LegacyVisualBrowserIdentity & {
    devicePixelRatio: number;
    scenarioIds: string[];
    viewport: LegacyVisualDimensions;
    webGlFingerprint: LegacyVisualWebGlFingerprint;
  }>;
  calibrations: LegacyVisualSceneCalibration[];
  captureEvidence: LegacyVisualCalibrationCaptureSummary;
  publicUniformCanvasReadiness: {
    minimumNonTransparentPixels: number;
    minimumObservedNonTransparentPixels: number;
    stability: LegacyPublicUniformCanvasStability;
    trigger: string;
  };
  runCount: number;
  sourceCommit: string;
}

function parseCalibration(value: unknown): ParsedCalibration {
  expectRecord(value, 'calibration');
  if (value.schemaVersion !== 3) {
    throw new Error('calibration.schemaVersion must be 3.');
  }
  const sourceCommit = readString(
    value.sourceCommit,
    'calibration.sourceCommit',
  );
  if (!SHA_1_PATTERN.test(sourceCommit)) {
    throw new Error('calibration.sourceCommit must be a lowercase SHA-1.');
  }
  expectRecord(value.comparison, 'calibration.comparison');
  const runCount = readPositiveInteger(
    value.comparison.runCount,
    'calibration.comparison.runCount',
  );
  if (runCount !== LEGACY_VISUAL_RUN_COUNT) {
    throw new Error('calibration.comparison.runCount must be 20.');
  }
  if (
    value.comparison.ignoredChannelDeltaAtOrBelow
    !== LEGACY_CHANNEL_DELTA_THRESHOLD
  ) {
    throw new Error(
      'calibration.comparison.ignoredChannelDeltaAtOrBelow must be 3.',
    );
  }
  if (value.comparison.thresholdFormula !== LEGACY_THRESHOLD_FORMULA) {
    throw new Error('calibration.comparison.thresholdFormula is unsupported.');
  }
  const thresholdCap = readRatio(
    value.comparison.thresholdCap,
    'calibration.comparison.thresholdCap',
  );
  if (thresholdCap !== LEGACY_VISUAL_THRESHOLD_CAP) {
    throw new Error('calibration.comparison.thresholdCap must be 0.005.');
  }
  const readinessLabel =
    'calibration.comparison.publicUniformCanvasReadiness';
  expectRecord(
    value.comparison.publicUniformCanvasReadiness,
    readinessLabel,
  );
  const readiness = value.comparison.publicUniformCanvasReadiness;
  const readinessTrigger = readString(
    readiness.trigger,
    `${readinessLabel}.trigger`,
  );
  if (readinessTrigger !== LEGACY_PUBLIC_UNIFORM_CANVAS_READINESS_TRIGGER) {
    throw new Error(
      `${readinessLabel}.trigger must be `
      + `${LEGACY_PUBLIC_UNIFORM_CANVAS_READINESS_TRIGGER}.`,
    );
  }
  const minimumNonTransparentPixels = readPositiveInteger(
    readiness.minimumNonTransparentPixels,
    `${readinessLabel}.minimumNonTransparentPixels`,
  );
  if (
    minimumNonTransparentPixels
    !== LEGACY_PUBLIC_UNIFORM_CANVAS_MIN_NON_TRANSPARENT_PIXELS
  ) {
    throw new Error(
      `${readinessLabel}.minimumNonTransparentPixels must be `
      + `${LEGACY_PUBLIC_UNIFORM_CANVAS_MIN_NON_TRANSPARENT_PIXELS}.`,
    );
  }
  const stability = parseLegacyPublicCanvasStability(
    readiness.stability,
    `${readinessLabel}.stability`,
  );
  const calibrations: LegacyVisualSceneCalibration[] = [];
  const browsers = readArray(value.browsers, 'calibration.browsers').map(
    (browserValue, browserIndex) => {
      const label = `calibration.browsers[${browserIndex}]`;
      expectRecord(browserValue, label);
      const browserIdentity = parseLegacyVisualBrowserIdentity(
        browserValue,
        label,
      );
      const devicePixelRatio = readPositiveInteger(
        browserValue.devicePixelRatio,
        `${label}.devicePixelRatio`,
      );
      expectRecord(browserValue.viewport, `${label}.viewport`);
      const viewport = {
        height: readPositiveInteger(
          browserValue.viewport.height,
          `${label}.viewport.height`,
        ),
        width: readPositiveInteger(
          browserValue.viewport.width,
          `${label}.viewport.width`,
        ),
      };
      const webGlFingerprint = parseLegacyVisualWebGlFingerprint(
        browserValue.webGlFingerprint,
        `${label}.webGlFingerprint`,
      );
      const scenarios = readArray(
        browserValue.scenarios,
        `${label}.scenarios`,
      ).map((scenario, scenarioIndex) => parseLegacyVisualScenario(
        scenario,
        {
          devicePixelRatio,
          label: `${label}.scenarios[${scenarioIndex}]`,
          runCount,
          viewport,
        },
      ));
      if (scenarios.length === 0) {
        throw new Error(`${label}.scenarios must not be empty.`);
      }
      const scenarioIds = scenarios.map((scenario) => scenario.scenarioId);
      assertUnique(scenarioIds, `${label}.scenario ids`);
      calibrations.push(...scenarios);
      return {
        ...browserIdentity,
        devicePixelRatio,
        scenarioIds,
        viewport,
        webGlFingerprint,
      };
    },
  );
  if (browsers.length === 0) {
    throw new Error('calibration.browsers must not be empty.');
  }
  assertUnique(
    browsers.map((browser) => browser.devicePixelRatio),
    'calibration browser DPR values',
  );
  const captureEvidence = parseLegacyVisualCalibrationCaptureSummary(
    value.captureEvidence,
    browsers,
  );
  if (value.passed !== true) throw new Error('calibration.passed must be true.');
  const minimumObservedNonTransparentPixels = Math.min(
    ...calibrations.map(
      (entry) => entry.publicUniformCanvas.nonTransparentPixels,
    ),
  );
  return {
    browsers,
    calibrations,
    captureEvidence,
    publicUniformCanvasReadiness: {
      minimumNonTransparentPixels,
      minimumObservedNonTransparentPixels,
      stability,
      trigger: readinessTrigger,
    },
    runCount,
    sourceCommit,
  };
}

/**
 * Validate and join the committed calibration report with its legacy manifest.
 */
export function parseLegacyVisualGateMetadata(
  calibrationValue: unknown,
  manifestValue: unknown,
): LegacyVisualGateMetadata {
  const calibration = parseCalibration(calibrationValue);
  const manifest = parseLegacyVisualManifest(manifestValue);
  const contract = calibration.captureEvidence.contract;
  if (
    calibration.captureEvidence.contractSha256
    !== manifest.captureContractSha256
  ) {
    throw new Error('Calibration capture contract does not match the manifest.');
  }
  if (
    contract.browser.browserName !== manifest.browserName
    || contract.browser.browserVersion !== manifest.browserVersion
    || !haveSameLegacyVisualWebGlFingerprint(
      contract.browser.webGlFingerprint,
      manifest.webGlFingerprint,
    )
  ) {
    throw new Error('Capture contract browser does not match the manifest.');
  }
  if (
    !haveSameValues(
      contract.context.devicePixelRatios,
      manifest.devicePixelRatios,
    )
    || contract.context.viewport.width !== manifest.viewport.width
    || contract.context.viewport.height !== manifest.viewport.height
  ) {
    throw new Error('Capture contract context does not match the manifest.');
  }
  if (calibration.sourceCommit !== manifest.oracleCommit) {
    throw new Error('Calibration source commit does not match the manifest oracle.');
  }
  if (calibration.runCount !== manifest.runCount) {
    throw new Error('Calibration run count does not match the manifest.');
  }
  const calibratedDprs = calibration.browsers.map(
    (browser) => browser.devicePixelRatio,
  );
  if (!haveSameValues(calibratedDprs, manifest.devicePixelRatios)) {
    throw new Error('Calibration DPR values do not match the manifest.');
  }
  for (const browser of calibration.browsers) {
    for (const identityField of [
      'browserName',
      'browserVersion',
      'userAgent',
    ] as const) {
      if (browser[identityField] !== manifest[identityField]) {
        throw new Error(
          `Calibration DPR ${browser.devicePixelRatio} ${identityField} `
          + 'does not match the manifest.',
        );
      }
    }
    if (!haveSameValues(browser.scenarioIds, manifest.scenarioIds)) {
      throw new Error(
        `DPR ${browser.devicePixelRatio} scenarios do not match the manifest.`,
      );
    }
    if (
      browser.viewport.width !== manifest.viewport.width
      || browser.viewport.height !== manifest.viewport.height
    ) {
      throw new Error(
        `Calibration DPR ${browser.devicePixelRatio} viewport does not match the manifest.`,
      );
    }
    if (!haveSameLegacyVisualWebGlFingerprint(
      browser.webGlFingerprint,
      manifest.webGlFingerprint,
    )) {
      throw new Error(
        `Calibration DPR ${browser.devicePixelRatio} WebGL fingerprint `
        + 'does not match the manifest.',
      );
    }
    const manifestScreenshot = manifest.screenshotDimensions.find(
      (entry) => entry.devicePixelRatio === browser.devicePixelRatio,
    );
    if (!manifestScreenshot) {
      throw new Error(
        `Manifest lacks DPR ${browser.devicePixelRatio} screenshot dimensions.`,
      );
    }
    for (const scene of calibration.calibrations.filter(
      (entry) => entry.devicePixelRatio === browser.devicePixelRatio,
    )) {
      if (
        scene.screenshotWidth !== manifestScreenshot.width
        || scene.screenshotHeight !== manifestScreenshot.height
      ) {
        throw new Error(
          `Calibration DPR ${browser.devicePixelRatio} ${scene.scenarioId}`
          + ' screenshot dimensions do not match the manifest.',
        );
      }
    }
  }
  const maximumSelfDiff = Math.max(
    ...calibration.calibrations.map((entry) => entry.selfDiffMaxRatio),
  );
  if (Math.abs(maximumSelfDiff - manifest.selfDiffMaximum) > 1e-11) {
    throw new Error('Calibration self-diff maximum does not match the manifest.');
  }
  const maximumThreshold = Math.max(
    ...calibration.calibrations.map((entry) => entry.threshold),
  );
  if (maximumThreshold !== manifest.threshold) {
    throw new Error('Calibration threshold summary does not match the manifest.');
  }
  const calibrationReadiness = calibration.publicUniformCanvasReadiness;
  const manifestReadiness = manifest.publicUniformCanvasReadiness;
  if (
    calibrationReadiness.trigger !== manifestReadiness.trigger
    || calibrationReadiness.minimumNonTransparentPixels
      !== manifestReadiness.minimumNonTransparentPixels
    || calibrationReadiness.stability.consecutiveFrames
      !== manifestReadiness.stability.consecutiveFrames
    || calibrationReadiness.stability.fingerprint
      !== manifestReadiness.stability.fingerprint
    || calibrationReadiness.stability.sampling
      !== manifestReadiness.stability.sampling
  ) {
    throw new Error(
      'Calibration public canvas readiness policy does not match the manifest.',
    );
  }
  if (
    calibrationReadiness.minimumObservedNonTransparentPixels
    !== manifestReadiness.minimumObservedNonTransparentPixels
  ) {
    throw new Error(
      'Calibration public canvas observed minimum does not match the manifest.',
    );
  }
  return {
    artifacts: manifest.artifacts,
    browserName: manifest.browserName,
    browserVersion: manifest.browserVersion,
    calibrations: calibration.calibrations,
    captureEvidence: calibration.captureEvidence,
    devicePixelRatios: manifest.devicePixelRatios,
    oracleCommit: manifest.oracleCommit,
    publicUniformCanvasReadiness: manifest.publicUniformCanvasReadiness,
    runCount: manifest.runCount,
    scenarioIds: manifest.scenarioIds,
    userAgent: manifest.userAgent,
    viewport: manifest.viewport,
    webGlFingerprint: manifest.webGlFingerprint,
  };
}

/**
 * Validate that raw DPR capture artifacts belong to one parsed visual gate.
 */
export function validateLegacyVisualBrowserCaptures(
  metadata: LegacyVisualGateMetadata,
  captureArtifacts: unknown,
): readonly LegacyVisualBrowserCaptureMetadata[] {
  const captures = readArray(captureArtifacts, 'browserCaptures').map(
    (captureArtifact, captureIndex) => {
      const artifactLabel = `browserCaptures[${captureIndex}]`;
      expectRecord(captureArtifact, artifactLabel);
      const declaredDpr = readPositiveInteger(
        captureArtifact.devicePixelRatio,
        `${artifactLabel}.devicePixelRatio`,
      );
      const label = `${artifactLabel}.value`;
      return parseLegacyVisualBrowserCapture(
        captureArtifact.value,
        declaredDpr,
        metadata,
        label,
      );
    },
  );
  if (captures.length === 0) {
    throw new Error('browserCaptures must not be empty.');
  }
  assertUnique(
    captures.map((capture) => capture.devicePixelRatio),
    'browser capture DPR values',
  );
  if (new Set(captures.map((capture) => capture.captureId)).size !== 1) {
    throw new Error('Browser capture IDs do not match across DPR values.');
  }
  if (!haveSameValues(
    captures.map((capture) => capture.devicePixelRatio),
    metadata.devicePixelRatios,
  )) {
    throw new Error('Browser capture DPR values do not match the visual gate.');
  }
  return captures;
}
