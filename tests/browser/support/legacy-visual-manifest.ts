import type { LegacyVisualDimensions } from './legacy-visual-scenario';
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

const SHA_1_PATTERN = /^[a-f0-9]{40}$/u;

/** Validated visual-oracle fields selected from the broader legacy manifest. */
export interface ParsedLegacyVisualManifest {
  /** Paths and templates locating the committed visual artifacts. */
  artifacts: {
    /** Repository-relative calibration report path. */
    calibration: string;
    /** Repository-relative screenshot path template. */
    screenshots: string;
  };
  /** DPR values represented by the oracle. */
  devicePixelRatios: number[];
  /** Exact legacy commit used to capture the oracle. */
  oracleCommit: string;
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
}

/** Parse the visual-oracle subset of the committed legacy manifest. */
export function parseLegacyVisualManifest(
  value: unknown,
): ParsedLegacyVisualManifest {
  expectRecord(value, 'manifest');
  if (value.schemaVersion !== 1) {
    throw new Error('manifest.schemaVersion must be 1.');
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
  const selfDiffMaximum = readRatio(
    evidence.selfDiffMaximum,
    'manifest.browserEvidence.selfDiffMaximum',
  );
  if (evidence.result !== 'pass') {
    throw new Error('manifest.browserEvidence.result must be pass.');
  }
  expectRecord(evidence.artifacts, 'manifest.browserEvidence.artifacts');
  const artifacts = {
    calibration: readString(
      evidence.artifacts.calibration,
      'manifest.browserEvidence.artifacts.calibration',
    ),
    screenshots: readString(
      evidence.artifacts.screenshots,
      'manifest.browserEvidence.artifacts.screenshots',
    ),
  };
  return {
    artifacts,
    devicePixelRatios,
    oracleCommit,
    runCount,
    scenarioIds,
    screenshotDimensions,
    selfDiffMaximum,
    threshold,
    viewport,
  };
}
