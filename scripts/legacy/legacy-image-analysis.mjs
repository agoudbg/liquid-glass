import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** RGB channel delta ignored by calibrated screenshot comparisons. */
export const CHANNEL_DELTA_THRESHOLD = 3;

/** Compute the lowercase SHA-256 of one artifact file. */
export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (
    leftDistance <= aboveDistance
    && leftDistance <= upperLeftDistance
  ) {
    return left;
  }
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

/** Decode one non-interlaced RGB or RGBA PNG into packed RGBA pixels. */
export function decodePng(filePath) {
  const input = readFileSync(filePath);
  if (!input.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${filePath} is not a PNG file.`);
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const compressedChunks = [];
  for (let offset = 8; offset < input.length;) {
    const length = input.readUInt32BE(offset);
    const type = input.toString('ascii', offset + 4, offset + 8);
    const data = input.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      compressedChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  if (bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error(
      `${filePath} uses unsupported PNG encoding: depth=${bitDepth}, `
      + `type=${colorType}, interlace=${interlace}.`,
    );
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(compressedChunks));
  const decoded = Buffer.alloc(height * stride);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset];
      inputOffset += 1;
      const left = x >= channels ? decoded[rowOffset + x - channels] : 0;
      const above = y > 0 ? decoded[rowOffset - stride + x] : 0;
      const upperLeft = y > 0 && x >= channels
        ? decoded[rowOffset - stride + x - channels]
        : 0;
      let reconstructed;
      if (filter === 0) reconstructed = raw;
      else if (filter === 1) reconstructed = raw + left;
      else if (filter === 2) reconstructed = raw + above;
      else if (filter === 3) {
        reconstructed = raw + Math.floor((left + above) / 2);
      } else if (filter === 4) {
        reconstructed = raw + paethPredictor(left, above, upperLeft);
      } else {
        throw new Error(`${filePath} contains unknown PNG filter ${filter}.`);
      }
      decoded[rowOffset + x] = reconstructed & 0xff;
    }
  }

  const pixels = Buffer.alloc(width * height * 4);
  for (
    let source = 0, target = 0;
    source < decoded.length;
    source += channels, target += 4
  ) {
    pixels[target] = decoded[source];
    pixels[target + 1] = decoded[source + 1];
    pixels[target + 2] = decoded[source + 2];
    pixels[target + 3] = channels === 4 ? decoded[source + 3] : 255;
  }
  return { width, height, colorType, pixels };
}

/** Count raw pixels with a non-zero alpha channel. */
export function countNonTransparentPixels(image) {
  let count = 0;
  for (let offset = 3; offset < image.pixels.length; offset += 4) {
    if (image.pixels[offset] !== 0) count += 1;
  }
  return count;
}

function assertSameDimensions(reference, candidate, label) {
  if (
    reference.width !== candidate.width
    || reference.height !== candidate.height
  ) {
    throw new Error(
      `${label} dimensions differ: ${reference.width}x${reference.height} `
      + `versus ${candidate.width}x${candidate.height}.`,
    );
  }
}

/** Compare decoded screenshots using the calibrated RGB noise policy. */
export function compareImages(reference, candidate, includedPixels) {
  assertSameDimensions(reference, candidate, 'Compared images');
  let changedPixels = 0;
  let comparedPixels = 0;
  let channelDeltaSum = 0;
  let maxChannelDelta = 0;
  const pixelCount = reference.width * reference.height;
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
    if (pixelMaxDelta > CHANNEL_DELTA_THRESHOLD) changedPixels += 1;
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

/** Build the union of material rectangles in physical screenshot pixels. */
export function createMaterialMask(
  image,
  materialRectangles,
  devicePixelRatio,
) {
  const mask = new Uint8Array(image.width * image.height);
  for (const material of materialRectangles) {
    const rect = material.rect;
    const left = Math.max(0, Math.floor(rect.left * devicePixelRatio));
    const top = Math.max(0, Math.floor(rect.top * devicePixelRatio));
    const right = Math.min(
      image.width,
      Math.ceil(rect.right * devicePixelRatio),
    );
    const bottom = Math.min(
      image.height,
      Math.ceil(rect.bottom * devicePixelRatio),
    );
    for (let y = top; y < bottom; y += 1) {
      mask.fill(1, y * image.width + left, y * image.width + right);
    }
  }
  return mask;
}

function readPixel(image, x, y) {
  const clampedX = Math.max(0, Math.min(image.width - 1, x));
  const clampedY = Math.max(0, Math.min(image.height - 1, y));
  const offset = (clampedY * image.width + clampedX) * 4;
  return Array.from(image.pixels.subarray(offset, offset + 4));
}

/** Collect stable diagnostic probes from every material rectangle. */
export function collectKeyPixels(
  glassOn,
  glassOff,
  materials,
  devicePixelRatio,
) {
  const probes = [
    { name: 'center', xRatio: 0.5, yRatio: 0.5 },
    { name: 'upperLeftQuarter', xRatio: 0.25, yRatio: 0.25 },
    { name: 'lowerRightQuarter', xRatio: 0.75, yRatio: 0.75 },
  ];
  return materials.flatMap((material) => probes.map((probe) => {
    const xCss = material.rect.left + material.rect.width * probe.xRatio;
    const yCss = material.rect.top + material.rect.height * probe.yRatio;
    const x = Math.floor(xCss * devicePixelRatio);
    const y = Math.floor(yCss * devicePixelRatio);
    const on = readPixel(glassOn, x, y);
    const off = readPixel(glassOff, x, y);
    return {
      materialId: material.id,
      probe: probe.name,
      cssPosition: { x: xCss, y: yCss },
      physicalPosition: { x, y },
      glassOn: on,
      glassOff: off,
      absoluteRgbDelta: on.slice(0, 3).map(
        (value, index) => Math.abs(value - off[index]),
      ),
    };
  }));
}

/** Round persisted comparison metrics to the baseline schema precision. */
export function roundMetrics(metrics) {
  return {
    ...metrics,
    diffRatio: Number(metrics.diffRatio.toFixed(12)),
    meanAbsoluteChannelDelta: Number(
      metrics.meanAbsoluteChannelDelta.toFixed(6),
    ),
  };
}
