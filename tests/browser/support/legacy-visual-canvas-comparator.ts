import {
  compareLegacyGlassEffectPixels,
  compareLegacyRgbPixels,
  createLegacyMaterialMask,
  decodeLegacyComparisonPng,
  type LegacyCssRectangle,
  type LegacyGlassPngPair,
  type LegacyMaterialRectangle,
  type LegacyRgbaImage,
  type LegacyRgbDifference,
} from './legacy-visual-comparator';

/** RGBA difference measured over every raw-canvas backing pixel. */
export interface LegacyRawCanvasDifference {
  /** Number of included pixels with any RGBA channel difference. */
  changedPixels: number;
  /** Number of backing pixels fixed by the committed reference canvas. */
  comparedPixels: number;
  /** Changed pixels divided by compared pixels. */
  diffRatio: number;
  /** Mean absolute delta across all four channels. */
  meanAbsoluteChannelDelta: number;
  /** Largest absolute RGBA channel delta observed. */
  maxChannelDelta: number;
}

/** Strict raw-canvas parity evidence. */
export interface LegacyRawCanvasComparison {
  /** Pixels whose exact alpha differs between reference and candidate. */
  alphaMismatchPixels: number;
  /** Visible pixels in the candidate canvas. */
  candidateVisiblePixels: number;
  /** RGBA difference over every raw-canvas backing pixel. */
  difference: LegacyRawCanvasDifference;
  /** Visible pixels in the legacy canvas. */
  referenceVisiblePixels: number;
}

/** Paired screenshots and raw canvases used for composite comparison. */
export interface LegacyCompositeInteriorInput {
  /** Candidate full-page glass-on and glass-off screenshots. */
  candidate: LegacyGlassPngPair;
  /** Candidate raw presentation-canvas PNG. */
  candidateCanvas: Uint8Array;
  /** DPR used by the screenshots and raw canvases. */
  devicePixelRatio: number;
  /** Material rectangles included in the full-page comparison. */
  materialRectangles: readonly LegacyMaterialRectangle[];
  /** Legacy full-page glass-on and glass-off screenshots. */
  reference: LegacyGlassPngPair;
  /** Legacy raw presentation-canvas PNG. */
  referenceCanvas: Uint8Array;
  /** Legacy viewport-relative public-canvas bounds in CSS pixels. */
  referenceCanvasRect: LegacyCssRectangle;
}

/** Strict non-boundary composite evidence for one material. */
export interface LegacyCompositeMaterialComparison {
  /** Material pixels excluded by the legacy alpha boundary band. */
  excludedBoundaryPixels: number;
  /** Excluded boundary pixels divided by this material's pixels. */
  excludedBoundaryRatio: number;
  /** Glass-contribution difference over every non-boundary material pixel. */
  glassEffect: LegacyRgbDifference;
  /** Stable material identifier. */
  id: string;
  /** Total physical pixels covered by the material rectangle. */
  materialPixels: number;
  /** Material pixels remaining after boundary exclusion. */
  nonBoundaryPixels: number;
  /** Direct glass-on difference where the glass-off underlay is exact. */
  stableGlassOn: LegacyRgbDifference;
  /** Stable-underlay pixels divided by non-boundary material pixels. */
  stableInteriorRatio: number;
  /** Non-boundary pixels whose glass-off RGB underlay is exact. */
  stablePixels: number;
}

/** Strict composite evidence outside the browser rasterization boundary. */
export interface LegacyCompositeInteriorComparison {
  /** Material pixels excluded by the one-CSS-pixel alpha boundary band. */
  excludedBoundaryPixels: number;
  /** Excluded boundary pixels divided by all material pixels. */
  excludedBoundaryRatio: number;
  /** Glass-contribution difference across every non-boundary material pixel. */
  glassEffect: LegacyRgbDifference;
  /** Per-material coverage and optical comparisons. */
  materials: readonly LegacyCompositeMaterialComparison[];
  /** Stable-underlay glass-on comparison outside the boundary band. */
  stableGlassOn: LegacyRgbDifference;
  /** Stable pixels divided by all non-boundary material pixels. */
  stableInteriorRatio: number;
}

function assertSameDimensions(
  reference: LegacyRgbaImage,
  candidate: LegacyRgbaImage,
  label: string,
): void {
  if (
    reference.width !== candidate.width
    || reference.height !== candidate.height
  ) {
    throw new Error(
      `${label} dimensions differ: ${reference.width}x${reference.height}`
      + ` versus ${candidate.width}x${candidate.height}.`,
    );
  }
}

function countMaskPixels(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) {
    if (value !== 0) count += 1;
  }
  return count;
}

function isVisible(image: LegacyRgbaImage, pixel: number): boolean {
  return image.pixels[pixel * 4 + 3] !== 0;
}

/**
 * Compare every raw presentation-canvas pixel against the committed oracle.
 */
export function compareLegacyRawCanvasPngPixels(
  referencePng: Uint8Array,
  candidatePng: Uint8Array,
): LegacyRawCanvasComparison {
  const reference = decodeLegacyComparisonPng(
    referencePng,
    'Reference raw canvas PNG',
  );
  const candidate = decodeLegacyComparisonPng(
    candidatePng,
    'Candidate raw canvas PNG',
  );
  assertSameDimensions(reference, candidate, 'Raw canvas');

  let alphaMismatchPixels = 0;
  let candidateVisiblePixels = 0;
  let changedPixels = 0;
  let channelDeltaSum = 0;
  let comparedPixels = 0;
  let maxChannelDelta = 0;
  let referenceVisiblePixels = 0;
  const pixelCount = reference.width * reference.height;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const referenceVisible = isVisible(reference, pixel);
    const candidateVisible = isVisible(candidate, pixel);
    if (referenceVisible) referenceVisiblePixels += 1;
    if (candidateVisible) candidateVisiblePixels += 1;
    const offset = pixel * 4;
    if (reference.pixels[offset + 3] !== candidate.pixels[offset + 3]) {
      alphaMismatchPixels += 1;
    }
    comparedPixels += 1;
    let pixelMaxDelta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(
        reference.pixels[offset + channel]
        - candidate.pixels[offset + channel],
      );
      channelDeltaSum += delta;
      pixelMaxDelta = Math.max(pixelMaxDelta, delta);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    if (pixelMaxDelta > 0) changedPixels += 1;
  }
  if (comparedPixels === 0) {
    throw new Error('Raw canvas comparison must contain visible pixels.');
  }

  return {
    alphaMismatchPixels,
    candidateVisiblePixels,
    difference: {
      changedPixels,
      comparedPixels,
      diffRatio: changedPixels / comparedPixels,
      meanAbsoluteChannelDelta: channelDeltaSum / (comparedPixels * 4),
      maxChannelDelta,
    },
    referenceVisiblePixels,
  };
}

function markBoundaryTransitions(
  image: LegacyRgbaImage,
  boundary: Uint8Array,
): void {
  const { height, width } = image;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (x + 1 < width) {
        const right = pixel + 1;
        if (isVisible(image, pixel) !== isVisible(image, right)) {
          boundary[pixel] = 1;
          boundary[right] = 1;
        }
      }
      if (y + 1 < height) {
        const below = pixel + width;
        if (isVisible(image, pixel) !== isVisible(image, below)) {
          boundary[pixel] = 1;
          boundary[below] = 1;
        }
      }
    }
  }
}

function createDilatedCanvasBoundary(
  reference: LegacyRgbaImage,
  radius: number,
): Uint8Array {
  const boundary = new Uint8Array(reference.width * reference.height);
  markBoundaryTransitions(reference, boundary);
  const dilated = new Uint8Array(boundary.length);
  for (let pixel = 0; pixel < boundary.length; pixel += 1) {
    if (boundary[pixel] === 0) continue;
    const x = pixel % reference.width;
    const y = Math.floor(pixel / reference.width);
    const top = Math.max(0, y - radius);
    const bottom = Math.min(reference.height - 1, y + radius);
    const left = Math.max(0, x - radius);
    const right = Math.min(reference.width - 1, x + radius);
    for (let targetY = top; targetY <= bottom; targetY += 1) {
      dilated.fill(
        1,
        targetY * reference.width + left,
        targetY * reference.width + right + 1,
      );
    }
  }
  return dilated;
}

function assertCanvasGeometry(
  canvas: LegacyRgbaImage,
  rect: LegacyCssRectangle,
  devicePixelRatio: number,
): void {
  const expectedWidth = Math.round((rect.right - rect.left) * devicePixelRatio);
  const expectedHeight = Math.round((rect.bottom - rect.top) * devicePixelRatio);
  if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
    throw new Error(
      `Raw canvas ${canvas.width}x${canvas.height} does not match`
      + ` ${expectedWidth}x${expectedHeight} viewport geometry.`,
    );
  }
}

function hasStableRgb(
  reference: LegacyRgbaImage,
  candidate: LegacyRgbaImage,
  pixel: number,
): boolean {
  const offset = pixel * 4;
  for (let channel = 0; channel < 3; channel += 1) {
    if (reference.pixels[offset + channel] !== candidate.pixels[offset + channel]) {
      return false;
    }
  }
  return true;
}

interface CompositeInteriorMasks {
  excludedBoundaryPixels: number;
  interior: Uint8Array;
  materialPixels: number;
  nonBoundaryPixels: number;
  stable: Uint8Array;
  stablePixels: number;
}

function createCompositeInteriorMasks(
  materialMask: Uint8Array,
  boundary: Uint8Array,
  canvas: LegacyRgbaImage,
  originX: number,
  originY: number,
  screenshotWidth: number,
  referenceOff: LegacyRgbaImage,
  candidateOff: LegacyRgbaImage,
  label: string,
): CompositeInteriorMasks {
  const interior = materialMask.slice();
  let excludedBoundaryPixels = 0;
  for (let pixel = 0; pixel < interior.length; pixel += 1) {
    if (interior[pixel] === 0) continue;
    const screenshotX = pixel % screenshotWidth;
    const screenshotY = Math.floor(pixel / screenshotWidth);
    const canvasX = screenshotX - originX;
    const canvasY = screenshotY - originY;
    const insideCanvas = canvasX >= 0
      && canvasX < canvas.width
      && canvasY >= 0
      && canvasY < canvas.height;
    if (
      insideCanvas
      && boundary[canvasY * canvas.width + canvasX] !== 0
    ) {
      interior[pixel] = 0;
      excludedBoundaryPixels += 1;
    }
  }

  const stable = interior.slice();
  for (let pixel = 0; pixel < stable.length; pixel += 1) {
    if (
      stable[pixel] !== 0
      && !hasStableRgb(referenceOff, candidateOff, pixel)
    ) {
      stable[pixel] = 0;
    }
  }

  const materialPixels = countMaskPixels(materialMask);
  const nonBoundaryPixels = countMaskPixels(interior);
  const stablePixels = countMaskPixels(stable);
  if (materialPixels === 0 || nonBoundaryPixels === 0 || stablePixels === 0) {
    throw new Error(`${label} composite interior mask must not be empty.`);
  }
  return {
    excludedBoundaryPixels,
    interior,
    materialPixels,
    nonBoundaryPixels,
    stable,
    stablePixels,
  };
}

/**
 * Compare composited glass pixels away from the raw alpha silhouette.
 *
 * The one-CSS-pixel exclusion isolates browser stacking-context rasterization.
 * Raw RGBA parity remains responsible for the complete optical silhouette.
 */
export function compareLegacyCompositeInteriorPngPixels(
  input: LegacyCompositeInteriorInput,
): LegacyCompositeInteriorComparison {
  const referenceOn = decodeLegacyComparisonPng(
    input.reference.glassOn,
    'Reference composite glass-on PNG',
  );
  const referenceOff = decodeLegacyComparisonPng(
    input.reference.glassOff,
    'Reference composite glass-off PNG',
  );
  const candidateOn = decodeLegacyComparisonPng(
    input.candidate.glassOn,
    'Candidate composite glass-on PNG',
  );
  const candidateOff = decodeLegacyComparisonPng(
    input.candidate.glassOff,
    'Candidate composite glass-off PNG',
  );
  assertSameDimensions(referenceOn, referenceOff, 'Reference composite');
  assertSameDimensions(referenceOn, candidateOn, 'Composite glass-on');
  assertSameDimensions(referenceOn, candidateOff, 'Composite glass-off');

  const referenceCanvas = decodeLegacyComparisonPng(
    input.referenceCanvas,
    'Reference raw canvas PNG',
  );
  const candidateCanvas = decodeLegacyComparisonPng(
    input.candidateCanvas,
    'Candidate raw canvas PNG',
  );
  assertSameDimensions(referenceCanvas, candidateCanvas, 'Raw canvas');
  assertCanvasGeometry(
    referenceCanvas,
    input.referenceCanvasRect,
    input.devicePixelRatio,
  );
  const boundary = createDilatedCanvasBoundary(
    referenceCanvas,
    Math.max(0, Math.ceil(input.devicePixelRatio) - 1),
  );
  const materialMask = createLegacyMaterialMask(
    referenceOn,
    input.materialRectangles,
    input.devicePixelRatio,
  );
  const originX = Math.round(
    input.referenceCanvasRect.left * input.devicePixelRatio,
  );
  const originY = Math.round(
    input.referenceCanvasRect.top * input.devicePixelRatio,
  );
  const masks = createCompositeInteriorMasks(
    materialMask,
    boundary,
    referenceCanvas,
    originX,
    originY,
    referenceOn.width,
    referenceOff,
    candidateOff,
    'Combined material',
  );
  const materials = input.materialRectangles.map((material) => {
    const materialMasks = createCompositeInteriorMasks(
      createLegacyMaterialMask(
        referenceOn,
        [material],
        input.devicePixelRatio,
      ),
      boundary,
      referenceCanvas,
      originX,
      originY,
      referenceOn.width,
      referenceOff,
      candidateOff,
      `Material ${material.id}`,
    );
    return {
      excludedBoundaryPixels: materialMasks.excludedBoundaryPixels,
      excludedBoundaryRatio:
        materialMasks.excludedBoundaryPixels / materialMasks.materialPixels,
      glassEffect: compareLegacyGlassEffectPixels(
        referenceOn,
        referenceOff,
        candidateOn,
        candidateOff,
        materialMasks.interior,
      ),
      id: material.id,
      materialPixels: materialMasks.materialPixels,
      nonBoundaryPixels: materialMasks.nonBoundaryPixels,
      stableGlassOn: compareLegacyRgbPixels(
        referenceOn,
        candidateOn,
        materialMasks.stable,
      ),
      stableInteriorRatio:
        materialMasks.stablePixels / materialMasks.nonBoundaryPixels,
      stablePixels: materialMasks.stablePixels,
    };
  });
  return {
    excludedBoundaryPixels: masks.excludedBoundaryPixels,
    excludedBoundaryRatio:
      masks.excludedBoundaryPixels / masks.materialPixels,
    glassEffect: compareLegacyGlassEffectPixels(
      referenceOn,
      referenceOff,
      candidateOn,
      candidateOff,
      masks.interior,
    ),
    materials,
    stableGlassOn: compareLegacyRgbPixels(
      referenceOn,
      candidateOn,
      masks.stable,
    ),
    stableInteriorRatio: masks.stablePixels / masks.nonBoundaryPixels,
  };
}
