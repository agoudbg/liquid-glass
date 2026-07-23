import {
  type LegacyMaterialRectangle,
  type LegacyRgbDifference,
} from './legacy-visual-comparator';
import {
  assertUnique,
  expectRecord,
  readArray,
  readNumber,
  readPositiveInteger,
  readRatio,
  readString,
} from './legacy-visual-schema';

const METRIC_TOLERANCE = 1e-11;

/** Maximum self-diff ratio allowed by the calibrated legacy policy. */
export const LEGACY_VISUAL_THRESHOLD_CAP = 0.005;

/** Minimum candidate threshold allowed by the calibrated legacy policy. */
export const LEGACY_VISUAL_THRESHOLD_FLOOR = 0.001;

/** CSS viewport dimensions shared by one calibrated browser run. */
export interface LegacyVisualDimensions {
  /** Height in CSS or physical pixels, depending on the containing field. */
  height: number;
  /** Width in CSS or physical pixels, depending on the containing field. */
  width: number;
}

/** One scene-specific baseline contract consumed by a future parity spec. */
export interface LegacyVisualSceneCalibration {
  /** DPR used for the baseline screenshot and rectangle mask. */
  devicePixelRatio: number;
  /** Legacy glass-on versus glass-off evidence for the material mask. */
  glassOnVersusOff: LegacyRgbDifference;
  /** CSS material rectangles whose union defines the comparison region. */
  materialRectangles: readonly LegacyMaterialRectangle[];
  /** Stable legacy scenario identifier. */
  scenarioId: string;
  /** Largest self-diff ratio observed across runs two through runCount. */
  selfDiffMaxRatio: number;
  /** Physical screenshot height. */
  screenshotHeight: number;
  /** Physical screenshot width. */
  screenshotWidth: number;
  /** Calibrated maximum candidate diff ratio for this scene. */
  threshold: number;
}

/** Context required to validate one scenario calibration entry. */
export interface LegacyVisualScenarioContext {
  /** DPR used to capture the containing browser report. */
  devicePixelRatio: number;
  /** Error-path prefix for actionable schema failures. */
  label: string;
  /** Total baseline runs, including the first reference run. */
  runCount: number;
  /** CSS viewport used to capture the scenario. */
  viewport: LegacyVisualDimensions;
}

function approximatelyEqual(first: number, second: number): boolean {
  return Math.abs(first - second) <= METRIC_TOLERANCE;
}

function readRectangle(
  value: unknown,
  label: string,
): LegacyMaterialRectangle {
  expectRecord(value, label);
  const id = readString(value.id, `${label}.id`);
  expectRecord(value.rect, `${label}.rect`);
  const left = readNumber(value.rect.left, `${label}.rect.left`);
  const top = readNumber(value.rect.top, `${label}.rect.top`);
  const right = readNumber(value.rect.right, `${label}.rect.right`);
  const bottom = readNumber(value.rect.bottom, `${label}.rect.bottom`);
  if (right < left) throw new Error(`${label}.rect.right must be at least left.`);
  if (bottom < top) throw new Error(`${label}.rect.bottom must be at least top.`);
  return { id, rect: { bottom, left, right, top } };
}

function readDifference(
  value: unknown,
  label: string,
): LegacyRgbDifference {
  expectRecord(value, label);
  const changedPixels = readNumber(
    value.changedPixels,
    `${label}.changedPixels`,
  );
  const comparedPixels = readNumber(
    value.comparedPixels,
    `${label}.comparedPixels`,
  );
  const diffRatio = readRatio(value.diffRatio, `${label}.diffRatio`);
  const meanAbsoluteChannelDelta = readNumber(
    value.meanAbsoluteChannelDelta,
    `${label}.meanAbsoluteChannelDelta`,
  );
  const maxChannelDelta = readNumber(
    value.maxChannelDelta,
    `${label}.maxChannelDelta`,
  );
  if (
    !Number.isInteger(changedPixels)
    || changedPixels < 0
    || !Number.isInteger(comparedPixels)
    || comparedPixels <= 0
    || changedPixels > comparedPixels
  ) {
    throw new Error(`${label} contains invalid pixel counts.`);
  }
  if (
    meanAbsoluteChannelDelta < 0
    || meanAbsoluteChannelDelta > 255
    || !Number.isInteger(maxChannelDelta)
    || maxChannelDelta < 0
    || maxChannelDelta > 255
  ) {
    throw new Error(`${label} contains invalid channel deltas.`);
  }
  if (!approximatelyEqual(diffRatio, changedPixels / comparedPixels)) {
    throw new Error(`${label}.diffRatio does not match its pixel counts.`);
  }
  return {
    changedPixels,
    comparedPixels,
    diffRatio,
    meanAbsoluteChannelDelta,
    maxChannelDelta,
  };
}

function readSelfDiff(
  value: unknown,
  runCount: number,
  label: string,
): { maxRatio: number; threshold: number } {
  expectRecord(value, label);
  const runs = readArray(value.runs, `${label}.runs`);
  if (runs.length !== runCount - 1) {
    throw new Error(`${label}.runs must contain ${runCount - 1} entries.`);
  }
  const parsedRuns = runs.map((entry, index) => {
    const runLabel = `${label}.runs[${index}]`;
    expectRecord(entry, runLabel);
    return {
      metrics: readDifference(entry, runLabel),
      run: readPositiveInteger(entry.run, `${runLabel}.run`),
    };
  });
  const runNumbers = parsedRuns.map((entry) => entry.run);
  assertUnique(runNumbers, `${label}.runs run numbers`);
  const expectedRuns = Array.from(
    { length: runCount - 1 },
    (_, index) => index + 2,
  );
  if (!expectedRuns.every((run) => runNumbers.includes(run))) {
    throw new Error(`${label}.runs must cover runs 2 through ${runCount}.`);
  }
  const maxRatio = readRatio(value.maxRatio, `${label}.maxRatio`);
  const measuredMaxRatio = Math.max(
    ...parsedRuns.map((entry) => entry.metrics.diffRatio),
  );
  if (!approximatelyEqual(maxRatio, measuredMaxRatio)) {
    throw new Error(`${label}.maxRatio does not match its run metrics.`);
  }
  const threshold = readRatio(value.threshold, `${label}.threshold`);
  const expectedThreshold = Math.min(
    LEGACY_VISUAL_THRESHOLD_CAP,
    Math.max(
      LEGACY_VISUAL_THRESHOLD_FLOOR,
      3 * maxRatio,
    ),
  );
  if (!approximatelyEqual(threshold, expectedThreshold)) {
    throw new Error(`${label}.threshold does not match the calibrated formula.`);
  }
  return { maxRatio, threshold };
}

/** Validate one scenario entry from the legacy visual calibration report. */
export function parseLegacyVisualScenario(
  value: unknown,
  context: LegacyVisualScenarioContext,
): LegacyVisualSceneCalibration {
  const { devicePixelRatio, label, runCount, viewport } = context;
  if (runCount < 2) throw new Error('Legacy visual runCount must be at least 2.');
  expectRecord(value, label);
  const scenarioId = readString(value.id, `${label}.id`);
  expectRecord(value.screenshotDimensions, `${label}.screenshotDimensions`);
  const screenshotWidth = readPositiveInteger(
    value.screenshotDimensions.width,
    `${label}.screenshotDimensions.width`,
  );
  const screenshotHeight = readPositiveInteger(
    value.screenshotDimensions.height,
    `${label}.screenshotDimensions.height`,
  );
  if (
    screenshotWidth !== viewport.width * devicePixelRatio
    || screenshotHeight !== viewport.height * devicePixelRatio
  ) {
    throw new Error(`${label} screenshot dimensions do not match viewport DPR.`);
  }
  const materialRectangles = readArray(
    value.materialRectangles,
    `${label}.materialRectangles`,
  ).map((entry, index) => readRectangle(
    entry,
    `${label}.materialRectangles[${index}]`,
  ));
  if (materialRectangles.length === 0) {
    throw new Error(`${label}.materialRectangles must not be empty.`);
  }
  assertUnique(
    materialRectangles.map((entry) => entry.id),
    `${label}.materialRectangles ids`,
  );
  const selfDiff = readSelfDiff(value.selfDiff, runCount, `${label}.selfDiff`);
  const glassOnVersusOff = readDifference(
    value.glassOnVersusOff,
    `${label}.glassOnVersusOff`,
  );
  if (glassOnVersusOff.diffRatio <= selfDiff.threshold) {
    throw new Error(`${label} lacks meaningful glass-on versus glass-off evidence.`);
  }
  if (value.consoleErrorCount !== 0) {
    throw new Error(`${label}.consoleErrorCount must be zero.`);
  }
  if (value.passed !== true) {
    throw new Error(`${label}.passed must be true.`);
  }
  return {
    devicePixelRatio,
    glassOnVersusOff,
    materialRectangles,
    scenarioId,
    selfDiffMaxRatio: selfDiff.maxRatio,
    screenshotHeight,
    screenshotWidth,
    threshold: selfDiff.threshold,
  };
}
