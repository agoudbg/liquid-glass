import {
  LEGACY_CHANNEL_DELTA_THRESHOLD,
} from './legacy-visual-comparator';
import { parseLegacyVisualManifest } from './legacy-visual-manifest';
import {
  LEGACY_VISUAL_THRESHOLD_CAP,
  type LegacyVisualDimensions,
  type LegacyVisualSceneCalibration,
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

const LEGACY_THRESHOLD_FORMULA =
  'min(0.005, max(0.001, 3 * maxSelfDiffRatio))';
const SHA_1_PATTERN = /^[a-f0-9]{40}$/u;

export type {
  LegacyVisualSceneCalibration,
} from './legacy-visual-scenario';

/** Validated legacy metadata required to construct visual parity tests. */
export interface LegacyVisualGateMetadata {
  /** Paths and templates locating the committed baseline artifacts. */
  artifacts: {
    /** Repository-relative calibration report path. */
    calibration: string;
    /** Repository-relative screenshot path template. */
    screenshots: string;
  };
  /** Flattened DPR-by-scene calibration entries. */
  calibrations: readonly LegacyVisualSceneCalibration[];
  /** DPR values represented by both the manifest and calibration report. */
  devicePixelRatios: readonly number[];
  /** Git commit from which every baseline was captured. */
  oracleCommit: string;
  /** Number of legacy self-diff runs per scene and DPR. */
  runCount: number;
  /** Scenario identifiers represented at every calibrated DPR. */
  scenarioIds: readonly string[];
}

interface ParsedCalibration {
  browsers: Array<{
    devicePixelRatio: number;
    scenarioIds: string[];
    viewport: LegacyVisualDimensions;
  }>;
  calibrations: LegacyVisualSceneCalibration[];
  runCount: number;
  sourceCommit: string;
}

function parseCalibration(value: unknown): ParsedCalibration {
  expectRecord(value, 'calibration');
  if (value.schemaVersion !== 1) {
    throw new Error('calibration.schemaVersion must be 1.');
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
  if (runCount < 2) {
    throw new Error('calibration.comparison.runCount must be at least 2.');
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
  const calibrations: LegacyVisualSceneCalibration[] = [];
  const browsers = readArray(value.browsers, 'calibration.browsers').map(
    (browserValue, browserIndex) => {
      const label = `calibration.browsers[${browserIndex}]`;
      expectRecord(browserValue, label);
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
      return { devicePixelRatio, scenarioIds, viewport };
    },
  );
  if (browsers.length === 0) {
    throw new Error('calibration.browsers must not be empty.');
  }
  assertUnique(
    browsers.map((browser) => browser.devicePixelRatio),
    'calibration browser DPR values',
  );
  if (value.passed !== true) throw new Error('calibration.passed must be true.');
  return { browsers, calibrations, runCount, sourceCommit };
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
  return {
    artifacts: manifest.artifacts,
    calibrations: calibration.calibrations,
    devicePixelRatios: manifest.devicePixelRatios,
    oracleCommit: manifest.oracleCommit,
    runCount: manifest.runCount,
    scenarioIds: manifest.scenarioIds,
  };
}
