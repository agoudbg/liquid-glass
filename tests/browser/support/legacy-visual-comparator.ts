import {
  decodeLegacyComparisonPng,
  type LegacyRgbaImage,
} from './legacy-png';

export {
  decodeLegacyComparisonPng,
  type LegacyRgbaImage,
} from './legacy-png';

/** RGB channel deltas at or below this value are legacy sampling noise. */
export const LEGACY_CHANNEL_DELTA_THRESHOLD = 3;

/** Maximum tolerated glass-off drift over one material comparison mask. */
export const LEGACY_UNDERLAY_DRIFT_RATIO_CAP = 0.005;

/** Minimum exact-RGB glass-off coverage required for each material. */
export const LEGACY_STABLE_UNDERLAY_RATIO_FLOOR = 0.95;

/** Viewport-relative CSS edges captured for one legacy material. */
export interface LegacyCssRectangle {
  /** Bottom edge in CSS pixels. */
  bottom: number;
  /** Left edge in CSS pixels. */
  left: number;
  /** Right edge in CSS pixels. */
  right: number;
  /** Top edge in CSS pixels. */
  top: number;
}

/** Material identity and bounds required to build a comparison mask. */
export interface LegacyMaterialRectangle {
  /** Stable scenario-local material identifier. */
  id: string;
  /** Viewport-relative material bounds. */
  rect: LegacyCssRectangle;
}

/** Exact aggregate metrics emitted by the legacy visual oracle. */
export interface LegacyRgbDifference {
  /** Number of included pixels with a maximum RGB delta above three. */
  changedPixels: number;
  /** Number of pixels included by the optional material mask. */
  comparedPixels: number;
  /** Changed pixels divided by compared pixels. */
  diffRatio: number;
  /** Mean absolute delta across the three RGB channels only. */
  meanAbsoluteChannelDelta: number;
  /** Largest absolute RGB channel delta observed. */
  maxChannelDelta: number;
}

/** Differential glass evidence computed from paired on/off screenshots. */
export interface LegacyGlassEffectComparison {
  /** Difference between the reference and candidate glass contributions. */
  glassEffect: LegacyRgbDifference;
  /** Direct glass-on difference over pixels whose underlays match exactly. */
  stableGlassOn: LegacyRgbDifference;
  /** Fraction of material pixels whose glass-off RGB values match exactly. */
  stableUnderlayRatio: number;
  /** Per-material exact-RGB underlay retention evidence. */
  materialStability: readonly LegacyMaterialUnderlayStability[];
  /** Difference between the reference and candidate glass-off underlays. */
  underlay: LegacyRgbDifference;
}

/** Exact underlay retention evidence for one material rectangle. */
export interface LegacyMaterialUnderlayStability {
  /** Stable material identifier. */
  id: string;
  /** Number of physical pixels in this material mask. */
  materialPixels: number;
  /** Stable pixels divided by material pixels. */
  stableRatio: number;
  /** Number of pixels whose glass-off RGB values match exactly. */
  stablePixels: number;
}

/** One paired screenshot state used by differential glass comparison. */
export interface LegacyGlassPngPair {
  /** Screenshot with the glass presentation disabled. */
  glassOff: Uint8Array;
  /** Screenshot with the glass presentation enabled. */
  glassOn: Uint8Array;
}

/** Inputs required to compare a candidate against the legacy glass pair. */
export interface LegacyGlassPairComparisonInput {
  /** Candidate glass-on and glass-off screenshots. */
  candidate: LegacyGlassPngPair;
  /** DPR used to convert CSS material bounds into physical pixels. */
  devicePixelRatio: number;
  /** Material rectangles whose pixels belong to the comparison. */
  materialRectangles: readonly LegacyMaterialRectangle[];
  /** Legacy reference glass-on and glass-off screenshots. */
  reference: LegacyGlassPngPair;
}

function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function readFiniteNumber(
  value: unknown,
  label: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function assertImage(image: LegacyRgbaImage, label: string): void {
  if (!Number.isInteger(image.width) || image.width <= 0) {
    throw new Error(`${label}.width must be a positive integer.`);
  }
  if (!Number.isInteger(image.height) || image.height <= 0) {
    throw new Error(`${label}.height must be a positive integer.`);
  }
  if (!(image.pixels instanceof Uint8Array)) {
    throw new Error(`${label}.pixels must be a Uint8Array.`);
  }
  const expectedLength = image.width * image.height * 4;
  if (image.pixels.length !== expectedLength) {
    throw new Error(
      `${label}.pixels must contain ${expectedLength} RGBA channels.`,
    );
  }
}

function assertSameDimensions(
  reference: LegacyRgbaImage,
  candidate: LegacyRgbaImage,
): void {
  if (
    reference.width !== candidate.width
    || reference.height !== candidate.height
  ) {
    throw new Error(
      `Compared images dimensions differ: ${reference.width}x${reference.height}`
      + ` versus ${candidate.width}x${candidate.height}.`,
    );
  }
}

function parseRectangle(
  material: LegacyMaterialRectangle,
  index: number,
): LegacyCssRectangle {
  const materialLabel = `materialRectangles[${index}]`;
  assertRecord(material, materialLabel);
  if (typeof material.id !== 'string' || material.id.length === 0) {
    throw new Error(`${materialLabel}.id must be a non-empty string.`);
  }
  assertRecord(material.rect, `${materialLabel}.rect`);
  const left = readFiniteNumber(
    material.rect.left,
    `${materialLabel}.rect.left`,
  );
  const top = readFiniteNumber(
    material.rect.top,
    `${materialLabel}.rect.top`,
  );
  const right = readFiniteNumber(
    material.rect.right,
    `${materialLabel}.rect.right`,
  );
  const bottom = readFiniteNumber(
    material.rect.bottom,
    `${materialLabel}.rect.bottom`,
  );
  if (right < left) {
    throw new Error(`${materialLabel}.rect.right must be at least left.`);
  }
  if (bottom < top) {
    throw new Error(`${materialLabel}.rect.bottom must be at least top.`);
  }
  return { bottom, left, right, top };
}

/**
 * Build the union of legacy material rectangles in physical pixel space.
 *
 * Leading edges use floor and trailing edges use ceil after DPR scaling, which
 * preserves every partially covered physical pixel from the captured CSS rect.
 */
export function createLegacyMaterialMask(
  image: LegacyRgbaImage,
  materialRectangles: readonly LegacyMaterialRectangle[],
  devicePixelRatio: number,
): Uint8Array {
  assertImage(image, 'image');
  if (
    !Number.isFinite(devicePixelRatio)
    || devicePixelRatio <= 0
  ) {
    throw new Error('devicePixelRatio must be a positive finite number.');
  }
  if (!Array.isArray(materialRectangles)) {
    throw new Error('materialRectangles must be an array.');
  }

  const mask = new Uint8Array(image.width * image.height);
  materialRectangles.forEach((material, index) => {
    const rect = parseRectangle(material, index);
    const left = Math.max(
      0,
      Math.min(image.width, Math.floor(rect.left * devicePixelRatio)),
    );
    const top = Math.max(
      0,
      Math.min(image.height, Math.floor(rect.top * devicePixelRatio)),
    );
    const right = Math.max(
      0,
      Math.min(image.width, Math.ceil(rect.right * devicePixelRatio)),
    );
    const bottom = Math.max(
      0,
      Math.min(image.height, Math.ceil(rect.bottom * devicePixelRatio)),
    );
    for (let y = top; y < bottom; y += 1) {
      mask.fill(1, y * image.width + left, y * image.width + right);
    }
  });
  return mask;
}

/**
 * Compare same-sized decoded images with the calibrated legacy RGB policy.
 */
export function compareLegacyRgbPixels(
  reference: LegacyRgbaImage,
  candidate: LegacyRgbaImage,
  includedPixels?: Uint8Array,
): LegacyRgbDifference {
  assertImage(reference, 'reference');
  assertImage(candidate, 'candidate');
  assertSameDimensions(reference, candidate);
  const pixelCount = reference.width * reference.height;
  if (includedPixels && includedPixels.length !== pixelCount) {
    throw new Error(`includedPixels must contain ${pixelCount} mask values.`);
  }

  let changedPixels = 0;
  let comparedPixels = 0;
  let channelDeltaSum = 0;
  let maxChannelDelta = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (includedPixels && includedPixels[pixel] === 0) continue;
    comparedPixels += 1;
    const offset = pixel * 4;
    let pixelMaxDelta = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(
        reference.pixels[offset + channel]
        - candidate.pixels[offset + channel],
      );
      channelDeltaSum += delta;
      pixelMaxDelta = Math.max(pixelMaxDelta, delta);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    if (pixelMaxDelta > LEGACY_CHANNEL_DELTA_THRESHOLD) changedPixels += 1;
  }

  return {
    changedPixels,
    comparedPixels,
    diffRatio: comparedPixels === 0 ? 0 : changedPixels / comparedPixels,
    meanAbsoluteChannelDelta: comparedPixels === 0
      ? 0
      : channelDeltaSum / (comparedPixels * 3),
    maxChannelDelta,
  };
}

/**
 * Compare isolated glass contributions over an explicit physical-pixel mask.
 */
export function compareLegacyGlassEffectPixels(
  referenceOn: LegacyRgbaImage,
  referenceOff: LegacyRgbaImage,
  candidateOn: LegacyRgbaImage,
  candidateOff: LegacyRgbaImage,
  includedPixels: Uint8Array,
): LegacyRgbDifference {
  assertImage(referenceOn, 'referenceOn');
  assertImage(referenceOff, 'referenceOff');
  assertImage(candidateOn, 'candidateOn');
  assertImage(candidateOff, 'candidateOff');
  assertSameDimensions(referenceOn, referenceOff);
  assertSameDimensions(referenceOn, candidateOn);
  assertSameDimensions(referenceOn, candidateOff);
  const pixelCount = referenceOn.width * referenceOn.height;
  if (includedPixels.length !== pixelCount) {
    throw new Error(`includedPixels must contain ${pixelCount} mask values.`);
  }

  let changedPixels = 0;
  let comparedPixels = 0;
  let channelDeltaSum = 0;
  let maxChannelDelta = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (includedPixels[pixel] === 0) continue;
    comparedPixels += 1;
    const offset = pixel * 4;
    let pixelMaxDelta = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const referenceEffect =
        referenceOn.pixels[offset + channel]
        - referenceOff.pixels[offset + channel];
      const candidateEffect =
        candidateOn.pixels[offset + channel]
        - candidateOff.pixels[offset + channel];
      const delta = Math.abs(referenceEffect - candidateEffect);
      channelDeltaSum += delta;
      pixelMaxDelta = Math.max(pixelMaxDelta, delta);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    if (pixelMaxDelta > LEGACY_CHANNEL_DELTA_THRESHOLD) changedPixels += 1;
  }

  return {
    changedPixels,
    comparedPixels,
    diffRatio: comparedPixels === 0 ? 0 : changedPixels / comparedPixels,
    meanAbsoluteChannelDelta: comparedPixels === 0
      ? 0
      : channelDeltaSum / (comparedPixels * 3),
    maxChannelDelta,
  };
}

function createStableUnderlayMask(
  referenceOff: LegacyRgbaImage,
  candidateOff: LegacyRgbaImage,
  materialMask: Uint8Array,
): Uint8Array {
  const stableMask = materialMask.slice();
  const pixelCount = referenceOff.width * referenceOff.height;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (materialMask[pixel] === 0) continue;
    const offset = pixel * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      if (
        referenceOff.pixels[offset + channel]
        !== candidateOff.pixels[offset + channel]
      ) {
        stableMask[pixel] = 0;
        break;
      }
    }
  }
  return stableMask;
}

function countMaskPixels(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) {
    if (value !== 0) count += 1;
  }
  return count;
}

/**
 * Decode two screenshots and compare their union of legacy material regions.
 */
export function compareLegacyMaskedPngPixels(
  referencePng: Uint8Array,
  candidatePng: Uint8Array,
  materialRectangles: readonly LegacyMaterialRectangle[],
  devicePixelRatio: number,
): LegacyRgbDifference {
  const reference = decodeLegacyComparisonPng(referencePng, 'Reference PNG');
  const candidate = decodeLegacyComparisonPng(candidatePng, 'Candidate PNG');
  assertSameDimensions(reference, candidate);
  const mask = createLegacyMaterialMask(
    reference,
    materialRectangles,
    devicePixelRatio,
  );
  return compareLegacyRgbPixels(reference, candidate, mask);
}

/**
 * Compare the isolated glass contribution from two paired on/off captures.
 *
 * The underlay result remains an independent guard against content or layout
 * drift. Subtracting each matching glass-off frame only prevents browser text
 * rasterization noise from being misclassified as a glass-rendering change.
 */
export function compareLegacyGlassEffectPngPixels(
  input: LegacyGlassPairComparisonInput,
): LegacyGlassEffectComparison {
  const referenceOn = decodeLegacyComparisonPng(
    input.reference.glassOn,
    'Reference glass-on PNG',
  );
  const referenceOff = decodeLegacyComparisonPng(
    input.reference.glassOff,
    'Reference glass-off PNG',
  );
  const candidateOn = decodeLegacyComparisonPng(
    input.candidate.glassOn,
    'Candidate glass-on PNG',
  );
  const candidateOff = decodeLegacyComparisonPng(
    input.candidate.glassOff,
    'Candidate glass-off PNG',
  );
  assertSameDimensions(referenceOn, referenceOff);
  assertSameDimensions(referenceOn, candidateOn);
  assertSameDimensions(referenceOn, candidateOff);
  const mask = createLegacyMaterialMask(
    referenceOn,
    input.materialRectangles,
    input.devicePixelRatio,
  );
  const materialPixels = countMaskPixels(mask);
  if (materialPixels === 0) {
    throw new Error('Legacy glass comparison material mask must not be empty.');
  }
  const stableMask = createStableUnderlayMask(
    referenceOff,
    candidateOff,
    mask,
  );
  const underlay = compareLegacyRgbPixels(referenceOff, candidateOff, mask);
  const stableGlassOn = compareLegacyRgbPixels(
    referenceOn,
    candidateOn,
    stableMask,
  );
  const materialStability = input.materialRectangles.map((material) => {
    const materialMask = createLegacyMaterialMask(
      referenceOn,
      [material],
      input.devicePixelRatio,
    );
    const pixels = countMaskPixels(materialMask);
    if (pixels === 0) {
      throw new Error(`Legacy material ${material.id} has an empty pixel mask.`);
    }
    const stablePixels = countMaskPixels(createStableUnderlayMask(
      referenceOff,
      candidateOff,
      materialMask,
    ));
    return {
      id: material.id,
      materialPixels: pixels,
      stablePixels,
      stableRatio: stablePixels / pixels,
    };
  });
  return {
    glassEffect: compareLegacyGlassEffectPixels(
      referenceOn,
      referenceOff,
      candidateOn,
      candidateOff,
      mask,
    ),
    materialStability,
    stableGlassOn,
    stableUnderlayRatio: stableGlassOn.comparedPixels / materialPixels,
    underlay,
  };
}
