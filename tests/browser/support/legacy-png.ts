import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Decoded, tightly packed RGBA pixels used by the legacy visual comparator. */
export interface LegacyRgbaImage {
  /** Physical pixel height. */
  height: number;
  /** Four bytes per physical pixel in row-major RGBA order. */
  pixels: Uint8Array;
  /** Physical pixel width. */
  width: number;
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function reconstructChannel(
  filter: number,
  raw: number,
  left: number,
  above: number,
  upperLeft: number,
  label: string,
): number {
  if (filter === 0) return raw;
  if (filter === 1) return raw + left;
  if (filter === 2) return raw + above;
  if (filter === 3) return raw + Math.floor((left + above) / 2);
  if (filter === 4) return raw + paethPredictor(left, above, upperLeft);
  throw new Error(`${label} contains unknown PNG filter ${filter}.`);
}

function readPngChunks(input: Buffer, label: string): {
  bitDepth: number;
  colorType: number;
  compressedChunks: Buffer[];
  height: number;
  interlace: number;
  width: number;
} {
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const compressedChunks: Buffer[] = [];
  for (let offset = PNG_SIGNATURE.length; offset < input.length;) {
    if (offset + 12 > input.length) {
      throw new Error(`${label} contains a truncated PNG chunk.`);
    }
    const length = input.readUInt32BE(offset);
    const chunkEnd = offset + length + 12;
    if (chunkEnd > input.length) {
      throw new Error(`${label} contains a truncated PNG chunk.`);
    }
    const type = input.toString('ascii', offset + 4, offset + 8);
    const data = input.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      if (data.length !== 13) {
        throw new Error(`${label} contains an invalid IHDR chunk.`);
      }
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
    offset = chunkEnd;
  }
  return {
    bitDepth,
    colorType,
    compressedChunks,
    height,
    interlace,
    width,
  };
}

function inflatePngRows(
  compressedChunks: readonly Buffer[],
  expectedLength: number,
  label: string,
): Buffer {
  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(compressedChunks));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} contains invalid compressed PNG data: ${reason}`);
  }
  if (inflated.length !== expectedLength) {
    throw new Error(
      `${label} decoded to ${inflated.length} bytes; expected ${expectedLength}.`,
    );
  }
  return inflated;
}

/**
 * Decode the non-interlaced 8-bit RGB/RGBA PNG subset produced by Chrome.
 *
 * The algorithm intentionally matches `scripts/legacy/analyze-legacy-oracle.mjs`
 * so baseline generation and rewrite comparison cannot disagree on pixels.
 */
export function decodeLegacyComparisonPng(
  encoded: Uint8Array,
  label = 'PNG image',
): LegacyRgbaImage {
  const input = Buffer.from(
    encoded.buffer,
    encoded.byteOffset,
    encoded.byteLength,
  );
  if (
    input.length < PNG_SIGNATURE.length
    || !input.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new Error(`${label} is not a PNG file.`);
  }

  const png = readPngChunks(input, label);
  if (
    png.width <= 0
    || png.height <= 0
    || png.compressedChunks.length === 0
  ) {
    throw new Error(`${label} is missing required PNG image data.`);
  }
  if (
    png.bitDepth !== 8
    || png.interlace !== 0
    || ![2, 6].includes(png.colorType)
  ) {
    throw new Error(
      `${label} uses unsupported PNG encoding: depth=${png.bitDepth},`
      + ` type=${png.colorType}, interlace=${png.interlace}.`,
    );
  }

  const channels = png.colorType === 6 ? 4 : 3;
  const stride = png.width * channels;
  const inflated = inflatePngRows(
    png.compressedChunks,
    png.height * (stride + 1),
    label,
  );
  const decoded = Buffer.alloc(png.height * stride);
  let inputOffset = 0;
  for (let y = 0; y < png.height; y += 1) {
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
      decoded[rowOffset + x] = reconstructChannel(
        filter,
        raw,
        left,
        above,
        upperLeft,
        label,
      ) & 0xff;
    }
  }

  const pixels = Buffer.alloc(png.width * png.height * 4);
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
  return { width: png.width, height: png.height, pixels };
}
