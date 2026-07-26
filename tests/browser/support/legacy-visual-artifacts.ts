import {
  type LegacyCssRectangle,
} from './legacy-visual-comparator';
import {
  expectRecord,
  readArray,
  readNumber,
  readPositiveInteger,
  readString,
} from './legacy-visual-schema';

const SHA_256_PATTERN = /^[a-f0-9]{64}$/u;
const RAW_PUBLIC_CANVAS_SERIALIZATION =
  'HTMLCanvasElement.toDataURL("image/png")';
const RAW_PUBLIC_CANVAS_TRANSFER = 'Playwright Download.saveAs';
const METRIC_TOLERANCE = 1e-9;

/** Dimensions shared by public-canvas metadata and raw PNG evidence. */
export interface LegacyCanvasDimensions {
  /** Physical canvas height. */
  height: number;
  /** Physical canvas width. */
  width: number;
}

/** One content-addressed PNG artifact in the committed visual oracle. */
export interface LegacyVisualPngArtifact {
  /** Repository-relative PNG path. */
  artifactPath: string;
  /** Lowercase SHA-256 of the committed PNG bytes. */
  sha256: string;
}

/** Serialized raw public-canvas artifact captured for one legacy scene. */
export interface LegacyRawPublicCanvasArtifact
  extends LegacyCanvasDimensions, LegacyVisualPngArtifact {
  /** One-based run from which the artifact was captured. */
  captureRun: number;
  /** Alpha coverage sampled in the same task that serialized the canvas. */
  nonTransparentPixels: number;
  /** Selector used to locate the public canvas. */
  selector: string;
  /** Browser API used to serialize the backing store. */
  serialization: string;
  /** Playwright API used to persist the browser download. */
  transfer: string;
}

/** Content-addressed glass-on and glass-off screenshots for one scene. */
export interface LegacyVisualScreenshotArtifacts {
  /** Screenshot captured with visual glass presentation disabled. */
  glassOff: LegacyVisualPngArtifact;
  /** Screenshot captured with visual glass presentation enabled. */
  glassOn: LegacyVisualPngArtifact;
}

function readSha256(value: unknown, label: string): string {
  const sha256 = readString(value, label);
  if (!SHA_256_PATTERN.test(sha256)) {
    throw new Error(`${label} must be a lowercase SHA-256.`);
  }
  return sha256;
}

/**
 * Parse one raw public-canvas artifact against its deterministic scene path.
 */
export function parseLegacyRawPublicCanvasArtifact(
  value: unknown,
  publicUniformCanvas: LegacyCanvasDimensions,
  scenarioId: string,
  devicePixelRatio: number,
  minimumNonTransparentPixels: number,
  label: string,
): LegacyRawPublicCanvasArtifact {
  expectRecord(value, label);
  const expectedArtifactPath =
    `tests/baselines/legacy/visual/dpr-${devicePixelRatio}/`
    + `${scenarioId}-canvas.png`;
  const artifactPath = readString(value.artifactPath, `${label}.artifactPath`);
  if (artifactPath !== expectedArtifactPath) {
    throw new Error(`${label}.artifactPath must be ${expectedArtifactPath}.`);
  }
  const captureRun = readPositiveInteger(
    value.captureRun,
    `${label}.captureRun`,
  );
  if (captureRun !== 1) {
    throw new Error(`${label}.captureRun must be 1.`);
  }
  const selector = readString(value.selector, `${label}.selector`);
  const expectedSelector = 'canvas.liquid-glass-uniform-canvas';
  if (selector !== expectedSelector) {
    throw new Error(`${label}.selector must be ${expectedSelector}.`);
  }
  const serialization = readString(
    value.serialization,
    `${label}.serialization`,
  );
  if (serialization !== RAW_PUBLIC_CANVAS_SERIALIZATION) {
    throw new Error(
      `${label}.serialization must be ${RAW_PUBLIC_CANVAS_SERIALIZATION}.`,
    );
  }
  const transfer = readString(value.transfer, `${label}.transfer`);
  if (transfer !== RAW_PUBLIC_CANVAS_TRANSFER) {
    throw new Error(`${label}.transfer must be ${RAW_PUBLIC_CANVAS_TRANSFER}.`);
  }
  const width = readPositiveInteger(value.width, `${label}.width`);
  const height = readPositiveInteger(value.height, `${label}.height`);
  if (
    width !== publicUniformCanvas.width
    || height !== publicUniformCanvas.height
  ) {
    throw new Error(`${label} dimensions do not match the public canvas.`);
  }
  const nonTransparentPixels = readPositiveInteger(
    value.nonTransparentPixels,
    `${label}.nonTransparentPixels`,
  );
  if (
    nonTransparentPixels <= minimumNonTransparentPixels
    || nonTransparentPixels > width * height
  ) {
    throw new Error(`${label}.nonTransparentPixels is outside the valid area.`);
  }
  return {
    artifactPath,
    captureRun,
    height,
    nonTransparentPixels,
    selector,
    serialization,
    sha256: readSha256(value.sha256, `${label}.sha256`),
    transfer,
    width,
  };
}

/**
 * Parse content-addressed on/off screenshots for one calibrated scene.
 */
export function parseLegacyScreenshotArtifacts(
  value: unknown,
  scenarioId: string,
  devicePixelRatio: number,
  label: string,
): LegacyVisualScreenshotArtifacts {
  expectRecord(value, label);
  const parseArtifact = (
    artifactValue: unknown,
    state: 'glass-off' | 'glass-on',
    artifactLabel: string,
  ): LegacyVisualPngArtifact => {
    expectRecord(artifactValue, artifactLabel);
    const expectedArtifactPath =
      `tests/baselines/legacy/visual/dpr-${devicePixelRatio}/`
      + `${scenarioId}-${state}.png`;
    const artifactPath = readString(
      artifactValue.artifactPath,
      `${artifactLabel}.artifactPath`,
    );
    if (artifactPath !== expectedArtifactPath) {
      throw new Error(
        `${artifactLabel}.artifactPath must be ${expectedArtifactPath}.`,
      );
    }
    return {
      artifactPath,
      sha256: readSha256(artifactValue.sha256, `${artifactLabel}.sha256`),
    };
  };
  return {
    glassOff: parseArtifact(
      value.glassOff,
      'glass-off',
      `${label}.glassOff`,
    ),
    glassOn: parseArtifact(
      value.glassOn,
      'glass-on',
      `${label}.glassOn`,
    ),
  };
}

/**
 * Read the viewport-relative CSS rectangle of the public presentation canvas.
 */
export function parseLegacyPublicCanvasRect(
  canvasDimensionsValue: unknown,
  publicUniformCanvas: LegacyCanvasDimensions,
  devicePixelRatio: number,
  className: string,
  label: string,
): LegacyCssRectangle {
  const canvasDimensions = readArray(canvasDimensionsValue, label);
  const matchingCanvas = canvasDimensions.find((canvasValue, index) => {
    const canvasLabel = `${label}[${index}]`;
    expectRecord(canvasValue, canvasLabel);
    return readString(
      canvasValue.className,
      `${canvasLabel}.className`,
    ).split(/\s+/u).includes(className);
  });
  if (!matchingCanvas) {
    throw new Error(`${label} lacks the public uniform canvas.`);
  }
  const canvasLabel = `${label} public uniform canvas`;
  expectRecord(matchingCanvas, canvasLabel);
  const width = readPositiveInteger(
    matchingCanvas.width,
    `${canvasLabel}.width`,
  );
  const height = readPositiveInteger(
    matchingCanvas.height,
    `${canvasLabel}.height`,
  );
  if (
    width !== publicUniformCanvas.width
    || height !== publicUniformCanvas.height
  ) {
    throw new Error(
      `${canvasLabel} dimensions do not match readiness.`,
    );
  }
  expectRecord(matchingCanvas.rect, `${canvasLabel}.rect`);
  const rect = matchingCanvas.rect;
  const x = readNumber(rect.x, `${canvasLabel}.rect.x`);
  const y = readNumber(rect.y, `${canvasLabel}.rect.y`);
  const cssWidth = readNumber(rect.width, `${canvasLabel}.rect.width`);
  const cssHeight = readNumber(rect.height, `${canvasLabel}.rect.height`);
  const left = readNumber(rect.left, `${canvasLabel}.rect.left`);
  const top = readNumber(rect.top, `${canvasLabel}.rect.top`);
  const right = readNumber(rect.right, `${canvasLabel}.rect.right`);
  const bottom = readNumber(rect.bottom, `${canvasLabel}.rect.bottom`);
  if (
    Math.abs(x - left) > METRIC_TOLERANCE
    || Math.abs(y - top) > METRIC_TOLERANCE
    || Math.abs(right - left - cssWidth) > METRIC_TOLERANCE
    || Math.abs(bottom - top - cssHeight) > METRIC_TOLERANCE
  ) {
    throw new Error(`${canvasLabel}.rect contains inconsistent edges.`);
  }
  if (
    Math.round(cssWidth * devicePixelRatio) !== width
    || Math.round(cssHeight * devicePixelRatio) !== height
  ) {
    throw new Error(`${canvasLabel}.rect does not match its DPR dimensions.`);
  }
  return { bottom, left, right, top };
}
