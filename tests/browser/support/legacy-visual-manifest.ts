import { parseLegacyVisualSha256 } from './legacy-visual-provenance';
import {
  LEGACY_PUBLIC_UNIFORM_CANVAS_MIN_NON_TRANSPARENT_PIXELS,
  LEGACY_PUBLIC_UNIFORM_CANVAS_READINESS_TRIGGER,
  type LegacyPublicUniformCanvasStability,
  type LegacyVisualDimensions,
  parseLegacyPublicCanvasStability,
} from './legacy-visual-scenario';
import {
  assertUnique,
  expectRecord,
  readArray,
  readNonNegativeInteger,
  readPositiveInteger,
  readRatio,
  readString,
  readStringArray,
} from './legacy-visual-schema';
import {
  type LegacyVisualWebGlFingerprint,
  parseLegacyVisualWebGlFingerprint,
} from './legacy-visual-webgl';

const SHA_1_PATTERN = /^[a-f0-9]{40}$/u;
const CHROME_BROWSER_NAME = 'Google Chrome';
const FOUR_PART_VERSION_PATTERN = /^\d+\.\d+\.\d+\.\d+$/u;
const CHROME_USER_AGENT_PATTERN = /(?:HeadlessChrome|Chrome)\/(\d+)\./u;
const CALIBRATION_PATH =
  'tests/baselines/legacy/visual-calibration.json';
const RAW_PUBLIC_CANVAS_TEMPLATE =
  'tests/baselines/legacy/visual/dpr-{1,2}/S00{1..6}-canvas.png';
const SCREENSHOT_TEMPLATE =
  'tests/baselines/legacy/visual/dpr-{1,2}/S00{1..6}-glass-{on,off}.png';

/** Frozen calibration run count for every legacy scene and DPR. */
export const LEGACY_VISUAL_RUN_COUNT = 20;

/** Browser identity fields shared by manifests, calibrations, and captures. */
export interface LegacyVisualBrowserIdentity {
  /** Browser product used for baseline capture. */
  browserName: string;
  /** Exact browser version used for baseline capture. */
  browserVersion: string;
  /** User agent recorded by the captured page. */
  userAgent: string;
}

/** Validated visual-oracle fields selected from the broader legacy manifest. */
export interface ParsedLegacyVisualManifest
  extends LegacyVisualBrowserIdentity {
  /** Paths and templates locating the committed visual artifacts. */
  artifacts: {
    /** Browser metadata files keyed by captured DPR. */
    browserMetadata: Array<{
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
  /** Canonical SHA-256 shared by every artifact in this capture. */
  captureContractSha256: string;
  /** DPR values represented by the oracle. */
  devicePixelRatios: number[];
  /** Exact legacy commit used to capture the oracle. */
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
  /** Physical screenshot dimensions keyed by captured DPR. */
  screenshotDimensions: Array<LegacyVisualDimensions & {
    /** DPR represented by these physical dimensions. */
    devicePixelRatio: number;
  }>;
  /** Largest self-diff ratio summarized across every scene and DPR. */
  selfDiffMaximum: number;
  /** Number of self-diff captures for each scene and DPR. */
  runCount: number;
  /** Scenario identifiers represented by the oracle. */
  scenarioIds: string[];
  /** Highest calibrated scene threshold summarized by the manifest. */
  threshold: number;
  /** CSS viewport shared by every visual-oracle capture. */
  viewport: LegacyVisualDimensions;
  /** Exact SwiftShader WebGL2 identity used by all baseline captures. */
  webGlFingerprint: LegacyVisualWebGlFingerprint;
}

/**
 * Parse the Chrome identity shared by every exact-pixel oracle artifact.
 */
export function parseLegacyVisualBrowserIdentity(
  value: unknown,
  label: string,
): LegacyVisualBrowserIdentity {
  expectRecord(value, label);
  const browserName = readString(
    value.browserName,
    `${label}.browserName`,
  );
  if (browserName !== CHROME_BROWSER_NAME) {
    throw new Error(`${label}.browserName must be ${CHROME_BROWSER_NAME}.`);
  }
  const browserVersion = readString(
    value.browserVersion,
    `${label}.browserVersion`,
  );
  if (!FOUR_PART_VERSION_PATTERN.test(browserVersion)) {
    throw new Error(
      `${label}.browserVersion must be a four-part numeric version.`,
    );
  }
  const userAgent = readString(value.userAgent, `${label}.userAgent`);
  const userAgentMatch = CHROME_USER_AGENT_PATTERN.exec(userAgent);
  if (!userAgentMatch) {
    throw new Error(`${label}.userAgent must identify Chrome.`);
  }
  const browserMajor = Number.parseInt(browserVersion.split('.')[0] ?? '', 10);
  const userAgentMajor = Number.parseInt(userAgentMatch[1] ?? '', 10);
  if (browserMajor !== userAgentMajor) {
    throw new Error(
      `${label}.userAgent Chrome major version must match browserVersion.`,
    );
  }
  return { browserName, browserVersion, userAgent };
}

/** Parse the visual-oracle subset of the committed legacy manifest. */
export function parseLegacyVisualManifest(
  value: unknown,
): ParsedLegacyVisualManifest {
  expectRecord(value, 'manifest');
  if (value.schemaVersion !== 3) {
    throw new Error('manifest.schemaVersion must be 3.');
  }
  expectRecord(value.oracle, 'manifest.oracle');
  const oracleCommit = readString(
    value.oracle.commit,
    'manifest.oracle.commit',
  );
  if (!SHA_1_PATTERN.test(oracleCommit)) {
    throw new Error('manifest.oracle.commit must be a lowercase SHA-1.');
  }
  expectRecord(value.browserEvidence, 'manifest.browserEvidence');
  const evidence = value.browserEvidence;
  const captureContractSha256 = parseLegacyVisualSha256(
    evidence.captureContractSha256,
    'manifest.browserEvidence.captureContractSha256',
  );
  const browserIdentity = parseLegacyVisualBrowserIdentity(
    {
      browserName: evidence.browser,
      browserVersion: evidence.browserVersion,
      userAgent: evidence.userAgent,
    },
    'manifest.browserEvidence',
  );
  const webGlFingerprint = parseLegacyVisualWebGlFingerprint(
    evidence.webGlFingerprint,
    'manifest.browserEvidence.webGlFingerprint',
  );
  const devicePixelRatios = readArray(
    evidence.devicePixelRatios,
    'manifest.browserEvidence.devicePixelRatios',
  ).map((entry, index) => readPositiveInteger(
    entry,
    `manifest.browserEvidence.devicePixelRatios[${index}]`,
  ));
  assertUnique(
    devicePixelRatios,
    'manifest.browserEvidence.devicePixelRatios',
  );
  const scenarioIds = readStringArray(
    evidence.scenarioIds,
    'manifest.browserEvidence.scenarioIds',
  );
  expectRecord(evidence.viewport, 'manifest.browserEvidence.viewport');
  const viewport = {
    height: readPositiveInteger(
      evidence.viewport.height,
      'manifest.browserEvidence.viewport.height',
    ),
    width: readPositiveInteger(
      evidence.viewport.width,
      'manifest.browserEvidence.viewport.width',
    ),
  };
  const screenshotDimensionValues = evidence.screenshotDimensions;
  expectRecord(
    screenshotDimensionValues,
    'manifest.browserEvidence.screenshotDimensions',
  );
  const screenshotDimensions = devicePixelRatios.map((devicePixelRatio) => {
    const key = `dpr${devicePixelRatio}`;
    const label = `manifest.browserEvidence.screenshotDimensions.${key}`;
    const entry = screenshotDimensionValues[key];
    expectRecord(entry, label);
    const width = readPositiveInteger(entry.width, `${label}.width`);
    const height = readPositiveInteger(entry.height, `${label}.height`);
    if (
      width !== viewport.width * devicePixelRatio
      || height !== viewport.height * devicePixelRatio
    ) {
      throw new Error(`${label} does not match the manifest viewport DPR.`);
    }
    return { devicePixelRatio, height, width };
  });
  const runCount = readPositiveInteger(
    evidence.runCountPerScenePerDpr,
    'manifest.browserEvidence.runCountPerScenePerDpr',
  );
  if (runCount !== LEGACY_VISUAL_RUN_COUNT) {
    throw new Error('manifest.browserEvidence.runCountPerScenePerDpr must be 20.');
  }
  const threshold = readRatio(
    evidence.threshold,
    'manifest.browserEvidence.threshold',
  );
  const consoleErrorCount = readNonNegativeInteger(
    evidence.consoleErrorCount,
    'manifest.browserEvidence.consoleErrorCount',
  );
  const pageErrorCount = readNonNegativeInteger(
    evidence.pageErrorCount,
    'manifest.browserEvidence.pageErrorCount',
  );
  if (consoleErrorCount !== 0 || pageErrorCount !== 0) {
    throw new Error('manifest.browserEvidence error counts must be zero.');
  }
  const readinessLabel =
    'manifest.browserEvidence.publicUniformCanvasReadiness';
  expectRecord(evidence.publicUniformCanvasReadiness, readinessLabel);
  const readiness = evidence.publicUniformCanvasReadiness;
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
  const minimumObservedNonTransparentPixels = readPositiveInteger(
    readiness.minimumObservedNonTransparentPixels,
    `${readinessLabel}.minimumObservedNonTransparentPixels`,
  );
  if (
    minimumObservedNonTransparentPixels
    <= minimumNonTransparentPixels
  ) {
    throw new Error(
      `${readinessLabel}.minimumObservedNonTransparentPixels must exceed `
      + 'minimumNonTransparentPixels.',
    );
  }
  const stability = parseLegacyPublicCanvasStability(
    readiness.stability,
    `${readinessLabel}.stability`,
  );
  const selfDiffMaximum = readRatio(
    evidence.selfDiffMaximum,
    'manifest.browserEvidence.selfDiffMaximum',
  );
  if (evidence.result !== 'pass') {
    throw new Error('manifest.browserEvidence.result must be pass.');
  }
  const artifactValues = evidence.artifacts;
  expectRecord(artifactValues, 'manifest.browserEvidence.artifacts');
  const artifacts = {
    browserMetadata: devicePixelRatios.map((devicePixelRatio) => ({
      devicePixelRatio,
      path: readString(
        artifactValues[`dpr${devicePixelRatio}Metadata`],
        `manifest.browserEvidence.artifacts.dpr${devicePixelRatio}Metadata`,
      ),
    })),
    calibration: readString(
      artifactValues.calibration,
      'manifest.browserEvidence.artifacts.calibration',
    ),
    rawPublicCanvases: readString(
      artifactValues.rawPublicCanvases,
      'manifest.browserEvidence.artifacts.rawPublicCanvases',
    ),
    screenshots: readString(
      artifactValues.screenshots,
      'manifest.browserEvidence.artifacts.screenshots',
    ),
  };
  if (artifacts.rawPublicCanvases !== RAW_PUBLIC_CANVAS_TEMPLATE) {
    throw new Error(
      'manifest.browserEvidence.artifacts.rawPublicCanvases is unsupported.',
    );
  }
  if (artifacts.calibration !== CALIBRATION_PATH) {
    throw new Error(
      'manifest.browserEvidence.artifacts.calibration is unsupported.',
    );
  }
  if (artifacts.screenshots !== SCREENSHOT_TEMPLATE) {
    throw new Error(
      'manifest.browserEvidence.artifacts.screenshots is unsupported.',
    );
  }
  for (const artifact of artifacts.browserMetadata) {
    const expectedPath =
      `tests/baselines/legacy/visual/browser-dpr-${artifact.devicePixelRatio}.json`;
    if (artifact.path !== expectedPath) {
      throw new Error(
        `manifest.browserEvidence.artifacts.dpr${artifact.devicePixelRatio}Metadata`
        + ' is unsupported.',
      );
    }
  }
  return {
    artifacts,
    ...browserIdentity,
    captureContractSha256,
    devicePixelRatios,
    oracleCommit,
    publicUniformCanvasReadiness: {
      minimumNonTransparentPixels,
      minimumObservedNonTransparentPixels,
      stability,
      trigger: readinessTrigger,
    },
    runCount,
    scenarioIds,
    screenshotDimensions,
    selfDiffMaximum,
    threshold,
    viewport,
    webGlFingerprint,
  };
}
