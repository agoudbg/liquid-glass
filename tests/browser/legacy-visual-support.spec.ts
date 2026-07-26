import { deflateSync } from 'node:zlib';

import { expect, test } from '@playwright/test';

import {
  compareLegacyCompositeInteriorPngPixels,
  compareLegacyRawCanvasPngPixels,
} from './support/legacy-visual-canvas-comparator';
import {
  compareLegacyGlassEffectPngPixels,
  compareLegacyMaskedPngPixels,
  compareLegacyRgbPixels,
  createLegacyMaterialMask,
  type LegacyRgbaImage,
} from './support/legacy-visual-comparator';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([
    length,
    Buffer.from(type, 'ascii'),
    data,
    Buffer.alloc(4),
  ]);
}

function encodeRgbaPng(
  width: number,
  height: number,
  pixels: readonly number[],
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    rows[rowOffset] = 0;
    for (let x = 0; x < width * 4; x += 1) {
      rows[rowOffset + x + 1] = pixels[y * width * 4 + x] ?? 0;
    }
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk('IHDR', header),
    createChunk('IDAT', deflateSync(rows)),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createImage(
  width: number,
  height: number,
  pixels: readonly number[],
): LegacyRgbaImage {
  return { width, height, pixels: Uint8Array.from(pixels) };
}

test.describe('legacy visual comparison support', () => {
  test('uses RGB only and changes a pixel only above the legacy noise floor', () => {
    const reference = createImage(2, 1, [
      10, 20, 30, 0,
      40, 50, 60, 0,
    ]);
    const candidate = createImage(2, 1, [
      13, 17, 33, 255,
      44, 50, 60, 255,
    ]);

    expect(compareLegacyRgbPixels(reference, candidate)).toEqual({
      changedPixels: 1,
      comparedPixels: 2,
      diffRatio: 0.5,
      meanAbsoluteChannelDelta: 13 / 6,
      maxChannelDelta: 4,
    });
  });

  test('creates the union of clipped CSS rectangles with DPR floor and ceil edges', () => {
    const image = createImage(5, 4, new Array(5 * 4 * 4).fill(0));
    const mask = createLegacyMaterialMask(image, [
      {
        id: 'first',
        rect: { left: 0.75, top: 0.5, right: 1.25, bottom: 1.01 },
      },
      {
        id: 'second',
        rect: { left: 1, top: 1, right: 2, bottom: 1.5 },
      },
      {
        id: 'clipped',
        rect: { left: -2, top: -2, right: 0.25, bottom: 0.25 },
      },
    ], 2);

    expect(Array.from(mask)).toEqual([
      1, 0, 0, 0, 0,
      0, 1, 1, 0, 0,
      0, 1, 1, 1, 0,
      0, 0, 0, 0, 0,
    ]);
  });

  test('decodes full PNGs before applying the material-region comparison', () => {
    const reference = encodeRgbaPng(3, 2, new Array(3 * 2 * 4).fill(0));
    const candidatePixels = new Array(3 * 2 * 4).fill(0);
    for (let index = 0; index < candidatePixels.length; index += 4) {
      candidatePixels[index] = 4;
      candidatePixels[index + 3] = 255;
    }
    const candidate = encodeRgbaPng(3, 2, candidatePixels);

    expect(compareLegacyMaskedPngPixels(reference, candidate, [
      {
        id: 'material',
        rect: { left: 0.5, top: 0, right: 1.25, bottom: 1 },
      },
    ], 2)).toEqual({
      changedPixels: 4,
      comparedPixels: 4,
      diffRatio: 1,
      meanAbsoluteChannelDelta: 4 / 3,
      maxChannelDelta: 4,
    });
  });

  test('isolates glass contribution while reporting underlay drift separately', () => {
    const referenceOff = encodeRgbaPng(2, 1, [
      10, 20, 30, 0,
      50, 60, 70, 0,
    ]);
    const referenceOn = encodeRgbaPng(2, 1, [
      30, 40, 50, 0,
      70, 80, 90, 0,
    ]);
    const candidateOff = encodeRgbaPng(2, 1, [
      14, 20, 30, 255,
      50, 60, 70, 255,
    ]);
    const candidateOn = encodeRgbaPng(2, 1, [
      34, 40, 50, 255,
      74, 80, 90, 255,
    ]);
    const comparison = compareLegacyGlassEffectPngPixels({
      candidate: {
        glassOff: candidateOff,
        glassOn: candidateOn,
      },
      devicePixelRatio: 1,
      materialRectangles: [{
        id: 'material',
        rect: { left: 0, top: 0, right: 2, bottom: 1 },
      }],
      reference: {
        glassOff: referenceOff,
        glassOn: referenceOn,
      },
    });

    expect(comparison.underlay.changedPixels).toBe(1);
    expect(comparison.stableUnderlayRatio).toBe(0.5);
    expect(comparison.materialStability).toEqual([{
      id: 'material',
      materialPixels: 2,
      stablePixels: 1,
      stableRatio: 0.5,
    }]);
    expect(comparison.stableGlassOn).toEqual({
      changedPixels: 1,
      comparedPixels: 1,
      diffRatio: 1,
      meanAbsoluteChannelDelta: 4 / 3,
      maxChannelDelta: 4,
    });
    expect(comparison.glassEffect).toEqual({
      changedPixels: 1,
      comparedPixels: 2,
      diffRatio: 0.5,
      meanAbsoluteChannelDelta: 4 / 6,
      maxChannelDelta: 4,
    });
  });

  test('compares every raw RGBA pixel and reports exact alpha drift', () => {
    const reference = encodeRgbaPng(3, 1, [
      20, 30, 40, 255,
      0, 0, 0, 0,
      70, 80, 90, 255,
    ]);
    const candidate = encodeRgbaPng(3, 1, [
      23, 27, 43, 255,
      10, 0, 0, 255,
      70, 80, 90, 251,
    ]);

    expect(compareLegacyRawCanvasPngPixels(reference, candidate)).toEqual({
      alphaMismatchPixels: 2,
      candidateVisiblePixels: 3,
      difference: {
        changedPixels: 3,
        comparedPixels: 3,
        diffRatio: 1,
        meanAbsoluteChannelDelta: 278 / 12,
        maxChannelDelta: 255,
      },
      referenceVisiblePixels: 2,
    });
  });

  test('checks every composite contribution outside the raw boundary band', () => {
    const rawPixels = new Array(9 * 9 * 4).fill(0);
    for (let y = 1; y <= 7; y += 1) {
      for (let x = 1; x <= 7; x += 1) {
        const offset = (y * 9 + x) * 4;
        rawPixels[offset] = 60;
        rawPixels[offset + 1] = 70;
        rawPixels[offset + 2] = 80;
        rawPixels[offset + 3] = 255;
      }
    }
    const referenceOnPixels = new Array(9 * 9 * 4).fill(10);
    const candidateOnPixels = [...referenceOnPixels];
    candidateOnPixels[(1 * 9 + 1) * 4] = 30;
    candidateOnPixels[(3 * 9 + 3) * 4] = 30;
    const candidateOffPixels = new Array(9 * 9 * 4).fill(0);
    candidateOffPixels[(4 * 9 + 4) * 4] = 20;
    const glassOff = encodeRgbaPng(
      9,
      9,
      new Array(9 * 9 * 4).fill(0),
    );
    const comparison = compareLegacyCompositeInteriorPngPixels({
      candidate: {
        glassOff: encodeRgbaPng(9, 9, candidateOffPixels),
        glassOn: encodeRgbaPng(9, 9, candidateOnPixels),
      },
      candidateCanvas: encodeRgbaPng(9, 9, rawPixels),
      devicePixelRatio: 1,
      materialRectangles: [{
        id: 'material',
        rect: { left: 0, top: 0, right: 9, bottom: 9 },
      }],
      reference: {
        glassOff,
        glassOn: encodeRgbaPng(9, 9, referenceOnPixels),
      },
      referenceCanvas: encodeRgbaPng(9, 9, rawPixels),
      referenceCanvasRect: { left: 0, top: 0, right: 9, bottom: 9 },
    });

    expect(comparison.excludedBoundaryPixels).toBe(52);
    expect(comparison.excludedBoundaryRatio).toBe(52 / 81);
    expect(comparison.glassEffect).toEqual({
      changedPixels: 2,
      comparedPixels: 29,
      diffRatio: 2 / 29,
      meanAbsoluteChannelDelta: 40 / 87,
      maxChannelDelta: 20,
    });
    expect(comparison.materials).toEqual([{
      excludedBoundaryPixels: 52,
      excludedBoundaryRatio: 52 / 81,
      glassEffect: {
        changedPixels: 2,
        comparedPixels: 29,
        diffRatio: 2 / 29,
        meanAbsoluteChannelDelta: 40 / 87,
        maxChannelDelta: 20,
      },
      id: 'material',
      materialPixels: 81,
      nonBoundaryPixels: 29,
      stableGlassOn: {
        changedPixels: 1,
        comparedPixels: 28,
        diffRatio: 1 / 28,
        meanAbsoluteChannelDelta: 20 / 84,
        maxChannelDelta: 20,
      },
      stableInteriorRatio: 28 / 29,
      stablePixels: 28,
    }]);
    expect(comparison.stableInteriorRatio).toBe(28 / 29);
    expect(comparison.stableGlassOn).toEqual({
      changedPixels: 1,
      comparedPixels: 28,
      diffRatio: 1 / 28,
      meanAbsoluteChannelDelta: 20 / 84,
      maxChannelDelta: 20,
    });
  });

  test('rejects incompatible PNG dimensions and invalid material schemas', () => {
    const onePixel = encodeRgbaPng(1, 1, [0, 0, 0, 255]);
    const twoPixels = encodeRgbaPng(2, 1, [
      0, 0, 0, 255,
      0, 0, 0, 255,
    ]);

    expect(() => compareLegacyMaskedPngPixels(onePixel, twoPixels, [], 1))
      .toThrow('Compared images dimensions differ: 1x1 versus 2x1.');
    expect(() => compareLegacyGlassEffectPngPixels({
      candidate: { glassOff: twoPixels, glassOn: onePixel },
      devicePixelRatio: 1,
      materialRectangles: [],
      reference: { glassOff: onePixel, glassOn: onePixel },
    })).toThrow('Compared images dimensions differ: 1x1 versus 2x1.');
    expect(() => compareLegacyGlassEffectPngPixels({
      candidate: { glassOff: onePixel, glassOn: onePixel },
      devicePixelRatio: 1,
      materialRectangles: [],
      reference: { glassOff: onePixel, glassOn: onePixel },
    })).toThrow('Legacy glass comparison material mask must not be empty.');
    expect(() => createLegacyMaterialMask(
      createImage(1, 1, [0, 0, 0, 255]),
      [{
        id: 'invalid',
        rect: { left: 1, top: 0, right: 0, bottom: 1 },
      }],
      1,
    )).toThrow('materialRectangles[0].rect.right must be at least left.');
  });
});
