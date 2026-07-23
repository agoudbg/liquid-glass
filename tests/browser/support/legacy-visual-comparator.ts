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
