import {
  type LegacyRawPublicCanvasArtifact,
  type LegacyVisualScreenshotArtifacts,
  parseLegacyPublicCanvasRect,
  parseLegacyRawPublicCanvasArtifact,
  parseLegacyScreenshotArtifacts,
} from './legacy-visual-artifacts';
import {
  type LegacyCssRectangle,
  type LegacyMaterialRectangle,
  type LegacyRgbDifference,
} from './legacy-visual-comparator';
import {
  type LegacyVisualScenarioState,
  parseLegacyVisualScenarioState,
} from './legacy-visual-scenario-state';
import {
  assertUnique,
  expectRecord,
  readArray,
  readNumber,
  readPositiveInteger,
  readRatio,
  readString,
  readStringArray,
} from './legacy-visual-schema';

const METRIC_TOLERANCE = 1e-11;

/** Maximum self-diff ratio allowed by the calibrated legacy policy. */
export const LEGACY_VISUAL_THRESHOLD_CAP = 0.005;

/** Minimum candidate threshold allowed by the calibrated legacy policy. */
export const LEGACY_VISUAL_THRESHOLD_FLOOR = 0.001;

/** Public canvas class required for every legacy visual-oracle capture. */
export const LEGACY_PUBLIC_UNIFORM_CANVAS_CLASS_NAME =
  'liquid-glass-uniform-canvas';

/** Exclusive alpha-pixel floor required for every legacy public canvas. */
export const LEGACY_PUBLIC_UNIFORM_CANVAS_MIN_NON_TRANSPARENT_PIXELS = 1000;

/** Deterministic lifecycle trigger used to populate the legacy public canvas. */
export const LEGACY_PUBLIC_UNIFORM_CANVAS_READINESS_TRIGGER = 'window-resize';

/** Consecutive identical RGBA frames required before oracle serialization. */
export const LEGACY_PUBLIC_UNIFORM_CANVAS_STABLE_FRAME_COUNT = 3;

/** Exact pixel fingerprint algorithm used for canvas stability. */
export const LEGACY_PUBLIC_UNIFORM_CANVAS_STABILITY_FINGERPRINT =
  'SHA-256 RGBA';

/** Frame boundary used between canvas stability samples. */
export const LEGACY_PUBLIC_UNIFORM_CANVAS_STABILITY_SAMPLING =
  'requestAnimationFrame';

/** Deterministic public-canvas frame-stability policy. */
export interface LegacyPublicUniformCanvasStability {
  /** Required number of consecutive identical frames. */
  consecutiveFrames: number;
  /** Pixel fingerprint algorithm. */
  fingerprint: string;
  /** Browser scheduling boundary between samples. */
  sampling: string;
}

/** CSS viewport dimensions shared by one calibrated browser run. */
export interface LegacyVisualDimensions {
  /** Height in CSS or physical pixels, depending on the containing field. */
  height: number;
  /** Width in CSS or physical pixels, depending on the containing field. */
  width: number;
}

/** Exact public uniform canvas evidence recorded for one legacy scene. */
export interface LegacyPublicUniformCanvasReadiness {
  /** CSS classes present on the user-visible uniform canvas. */
  classNames: string[];
  /** Physical canvas height. */
  height: number;
  /** Count of canvas pixels whose alpha channel is non-zero. */
  nonTransparentPixels: number;
  /** Physical canvas width. */
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
  /** Non-empty public uniform canvas captured for this scene. */
  publicUniformCanvas: LegacyPublicUniformCanvasReadiness;
  /** Viewport-relative legacy public-canvas rectangle in CSS pixels. */
  publicUniformCanvasRect: LegacyCssRectangle;
  /** Raw backing-store artifact used for strict optical parity. */
  rawPublicCanvas: LegacyRawPublicCanvasArtifact;
  /** Viewport scroll position used for the calibrated screenshot. */
  scrollPosition: {
    /** Horizontal window scroll in CSS pixels. */
    x: number;
    /** Vertical window scroll in CSS pixels. */
    y: number;
  };
  /** Deterministic interaction or scroll state used for this capture. */
  scenarioState: LegacyVisualScenarioState;
  /** Stable legacy scenario identifier. */
  scenarioId: string;
  /** Largest self-diff ratio observed across runs two through runCount. */
  selfDiffMaxRatio: number;
  /** Physical screenshot height. */
  screenshotHeight: number;
  /** Physical screenshot width. */
  screenshotWidth: number;
  /** Content-addressed glass-on and glass-off screenshots. */
  screenshotArtifacts: LegacyVisualScreenshotArtifacts;
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

function readPublicUniformCanvas(
  value: unknown,
  label: string,
): LegacyPublicUniformCanvasReadiness {
  expectRecord(value, label);
  const classNames = readStringArray(
    value.classNames,
    `${label}.classNames`,
  );
  if (!classNames.includes(LEGACY_PUBLIC_UNIFORM_CANVAS_CLASS_NAME)) {
    throw new Error(
      `${label}.classNames must include `
      + `${LEGACY_PUBLIC_UNIFORM_CANVAS_CLASS_NAME}.`,
    );
  }
  const width = readPositiveInteger(value.width, `${label}.width`);
  const height = readPositiveInteger(value.height, `${label}.height`);
  const nonTransparentPixels = readPositiveInteger(
    value.nonTransparentPixels,
    `${label}.nonTransparentPixels`,
  );
  if (
    nonTransparentPixels
    <= LEGACY_PUBLIC_UNIFORM_CANVAS_MIN_NON_TRANSPARENT_PIXELS
  ) {
    throw new Error(
      `${label}.nonTransparentPixels must exceed `
      + `${LEGACY_PUBLIC_UNIFORM_CANVAS_MIN_NON_TRANSPARENT_PIXELS}.`,
    );
  }
  if (nonTransparentPixels > width * height) {
    throw new Error(`${label}.nonTransparentPixels exceeds its canvas area.`);
  }
  return { classNames, height, nonTransparentPixels, width };
}

/** Parse the exact frame-stability policy recorded by the legacy oracle. */
export function parseLegacyPublicCanvasStability(
  value: unknown,
  label: string,
): LegacyPublicUniformCanvasStability {
  expectRecord(value, label);
  const consecutiveFrames = readPositiveInteger(
    value.consecutiveFrames,
    `${label}.consecutiveFrames`,
  );
  const fingerprint = readString(value.fingerprint, `${label}.fingerprint`);
  const sampling = readString(value.sampling, `${label}.sampling`);
  if (
    consecutiveFrames !== LEGACY_PUBLIC_UNIFORM_CANVAS_STABLE_FRAME_COUNT
    || fingerprint
      !== LEGACY_PUBLIC_UNIFORM_CANVAS_STABILITY_FINGERPRINT
    || sampling !== LEGACY_PUBLIC_UNIFORM_CANVAS_STABILITY_SAMPLING
  ) {
    throw new Error(`${label} does not match the exact RGBA stability policy.`);
  }
  return { consecutiveFrames, fingerprint, sampling };
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

function readScrollPosition(
  value: unknown,
  label: string,
): { x: number; y: number } {
  expectRecord(value, label);
  const x = readNumber(value.x, `${label}.x`);
  const y = readNumber(value.y, `${label}.y`);
  if (x < 0 || y < 0) {
    throw new Error(`${label} coordinates must not be negative.`);
  }
  return { x, y };
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
  const publicUniformCanvas = readPublicUniformCanvas(
    value.publicUniformCanvas,
    `${label}.publicUniformCanvas`,
  );
  const rawPublicCanvas = parseLegacyRawPublicCanvasArtifact(
    value.rawPublicCanvas,
    publicUniformCanvas,
    scenarioId,
    devicePixelRatio,
    LEGACY_PUBLIC_UNIFORM_CANVAS_MIN_NON_TRANSPARENT_PIXELS,
    `${label}.rawPublicCanvas`,
  );
  const publicUniformCanvasRect = parseLegacyPublicCanvasRect(
    value.canvasDimensions,
    publicUniformCanvas,
    devicePixelRatio,
    LEGACY_PUBLIC_UNIFORM_CANVAS_CLASS_NAME,
    `${label}.canvasDimensions`,
  );
  const screenshotArtifacts = parseLegacyScreenshotArtifacts(
    value.screenshotArtifacts,
    scenarioId,
    devicePixelRatio,
    `${label}.screenshotArtifacts`,
  );
  const scrollPosition = readScrollPosition(
    value.scrollPosition,
    `${label}.scrollPosition`,
  );
  const scenarioState = parseLegacyVisualScenarioState(
    value.scenarioState,
    scenarioId,
    `${label}.scenarioState`,
  );
  if (
    scenarioState.kind === 'window-scroll'
    && (
      scenarioState.x !== scrollPosition.x
      || scenarioState.y !== scrollPosition.y
    )
  ) {
    throw new Error(
      `${label}.scenarioState window position does not match scrollPosition.`,
    );
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
    publicUniformCanvas,
    publicUniformCanvasRect,
    rawPublicCanvas,
    scrollPosition,
    scenarioState,
    scenarioId,
    selfDiffMaxRatio: selfDiff.maxRatio,
    screenshotHeight,
    screenshotArtifacts,
    screenshotWidth,
    threshold: selfDiff.threshold,
  };
}
