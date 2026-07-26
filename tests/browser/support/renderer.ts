import { expect, type Locator, type Page } from '@playwright/test';

/** Serializable bounds read from one rendered browser element. */
export interface ElementRect {
  /** Viewport-relative left edge. */
  x: number;
  /** Viewport-relative top edge. */
  y: number;
  /** Rendered CSS width. */
  width: number;
  /** Rendered CSS height. */
  height: number;
}

/** Aggregate visual difference between two same-sized PNG screenshots. */
export interface PixelDifference {
  /** Fraction of pixels whose total RGBA delta exceeds the noise floor. */
  changedPixelRatio: number;
  /** Mean absolute delta across every RGBA channel. */
  meanChannelDelta: number;
}

/** Viewport rectangle used to sample presentation-canvas alpha coverage. */
export interface CanvasCoverageRectangle {
  /** Stable label included in the returned coverage evidence. */
  id: string;
  /** Viewport-relative rectangle edges in CSS pixels. */
  rect: {
    /** Bottom edge. */
    bottom: number;
    /** Left edge. */
    left: number;
    /** Right edge. */
    right: number;
    /** Top edge. */
    top: number;
  };
}

/** Alpha coverage observed within one viewport rectangle. */
export interface CanvasRegionCoverage {
  /** Stable rectangle label. */
  id: string;
  /** Number of sampled backing pixels with non-zero alpha. */
  nonTransparentPixels: number;
  /** Total number of backing pixels intersecting the canvas. */
  sampledPixels: number;
}

/** Exact RGBA fingerprint for one presentation-canvas frame. */
export interface CanvasPixelFingerprint {
  /** Physical canvas height. */
  height: number;
  /** Count of pixels whose alpha channel is non-zero. */
  nonTransparentPixels: number;
  /** SHA-256 digest of the complete RGBA backing array. */
  sha256: string;
  /** Physical canvas width. */
  width: number;
}

/** Serialize the canvas backing store without compositing DOM pixels behind it. */
export async function captureCanvasBackingStore(
  canvas: Locator,
): Promise<Buffer> {
  const dataUrl = await canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error('Expected the core-owned presentation canvas.');
    }
    return element.toDataURL('image/png');
  });
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) {
    throw new Error('Presentation canvas did not serialize to a PNG data URL.');
  }
  return Buffer.from(dataUrl.slice(prefix.length), 'base64');
}

/** Hash the exact RGBA backing array without relying on PNG encoder output. */
export async function readCanvasPixelFingerprint(
  canvas: Locator,
): Promise<CanvasPixelFingerprint> {
  return canvas.evaluate(async (element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error('Expected the core-owned presentation canvas.');
    }
    const context = element.getContext('2d');
    if (!context) throw new Error('Expected a 2D presentation context.');
    const pixels = context.getImageData(
      0,
      0,
      element.width,
      element.height,
    ).data;
    let nonTransparentPixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] !== 0) nonTransparentPixels += 1;
    }
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    const sha256 = Array.from(
      new Uint8Array(digest),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    return {
      height: element.height,
      nonTransparentPixels,
      sha256,
      width: element.width,
    };
  });
}

/** Read dimensions and non-transparent coverage from the visible 2D canvas. */
export async function readCanvasMetrics(canvas: Locator): Promise<{
  width: number;
  height: number;
  nonTransparentPixels: number;
}> {
  return canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error('Expected the core-owned presentation canvas.');
    }
    const context = element.getContext('2d');
    if (!context) throw new Error('Expected a 2D presentation context.');
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    let nonTransparentPixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] !== 0) nonTransparentPixels += 1;
    }
    return {
      width: element.width,
      height: element.height,
      nonTransparentPixels,
    };
  });
}

/** Read backing-pixel alpha coverage for viewport-relative material regions. */
export async function readCanvasRegionCoverage(
  canvas: Locator,
  rectangles: readonly CanvasCoverageRectangle[],
): Promise<CanvasRegionCoverage[]> {
  return canvas.evaluate((element, regions) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error('Expected the core-owned presentation canvas.');
    }
    const context = element.getContext('2d');
    if (!context) throw new Error('Expected a 2D presentation context.');
    const canvasRect = element.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) {
      throw new Error('Presentation canvas has no measurable CSS area.');
    }
    const scaleX = element.width / canvasRect.width;
    const scaleY = element.height / canvasRect.height;
    const pixels = context.getImageData(0, 0, element.width, element.height).data;

    return regions.map(({ id, rect }) => {
      const startX = Math.max(
        0,
        Math.floor((rect.left - canvasRect.left) * scaleX),
      );
      const endX = Math.min(
        element.width,
        Math.ceil((rect.right - canvasRect.left) * scaleX),
      );
      const startY = Math.max(
        0,
        Math.floor((rect.top - canvasRect.top) * scaleY),
      );
      const endY = Math.min(
        element.height,
        Math.ceil((rect.bottom - canvasRect.top) * scaleY),
      );
      let nonTransparentPixels = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          if (pixels[(y * element.width + x) * 4 + 3] !== 0) {
            nonTransparentPixels += 1;
          }
        }
      }
      return {
        id,
        nonTransparentPixels,
        sampledPixels: Math.max(0, endX - startX) * Math.max(0, endY - startY),
      };
    });
  }, rectangles);
}

/** Read one numeric data attribute, treating a missing value as zero. */
export async function readNumericAttribute(
  locator: Locator,
  name: string,
): Promise<number> {
  const value = await locator.getAttribute(name);
  return Number(value ?? '0');
}

/** Read stable viewport-relative geometry without Playwright scroll side effects. */
export async function readElementRect(locator: Locator): Promise<ElementRect> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

/** Wait until initialization observers stop producing additional captures. */
export async function waitForStableCaptureCount(
  page: Page,
  shell: Locator,
): Promise<number> {
  await expect.poll(() => readNumericAttribute(shell, 'data-capture-count'), {
    timeout: 15_000,
  }).toBeGreaterThan(0);

  let lastCount = await readNumericAttribute(shell, 'data-capture-count');
  let stableDuration = 0;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(200);
    const nextCount = await readNumericAttribute(shell, 'data-capture-count');
    if (nextCount === lastCount) {
      stableDuration += 200;
      if (stableDuration >= 600) return nextCount;
    } else {
      lastCount = nextCount;
      stableDuration = 0;
    }
  }
  throw new Error('Backdrop capture count did not stabilize after initialization.');
}

/** Capture the visible primary material without changing its scroll position. */
export async function capturePrimaryMaterial(page: Page): Promise<Buffer> {
  const material = page.getByTestId('primary-material');
  await expect(material).toBeVisible();
  const bounds = await material.boundingBox();
  if (!bounds) throw new Error('Primary material has no measurable bounds.');
  return page.screenshot({
    clip: {
      x: Math.floor(bounds.x),
      y: Math.floor(bounds.y),
      width: Math.ceil(bounds.width),
      height: Math.ceil(bounds.height),
    },
  });
}

/** Compare two PNG buffers using decoded browser pixels. */
export async function comparePngPixels(
  page: Page,
  first: Buffer,
  second: Buffer,
): Promise<PixelDifference> {
  return page.evaluate(async ({ firstPng, secondPng }) => {
    const decode = async (encoded: string): Promise<ImageData> => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to decode screenshot pixels.');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };

    const [firstPixels, secondPixels] = await Promise.all([
      decode(firstPng),
      decode(secondPng),
    ]);
    if (
      firstPixels.width !== secondPixels.width
      || firstPixels.height !== secondPixels.height
    ) {
      throw new Error('Glass comparison screenshots have different dimensions.');
    }

    let changedPixels = 0;
    let totalChannelDelta = 0;
    for (let index = 0; index < firstPixels.data.length; index += 4) {
      const red = Math.abs(firstPixels.data[index] - secondPixels.data[index]);
      const green = Math.abs(
        firstPixels.data[index + 1] - secondPixels.data[index + 1],
      );
      const blue = Math.abs(
        firstPixels.data[index + 2] - secondPixels.data[index + 2],
      );
      const alpha = Math.abs(
        firstPixels.data[index + 3] - secondPixels.data[index + 3],
      );
      const pixelDelta = red + green + blue + alpha;
      totalChannelDelta += pixelDelta;
      if (pixelDelta > 16) changedPixels += 1;
    }

    const pixelCount = firstPixels.width * firstPixels.height;
    return {
      changedPixelRatio: changedPixels / pixelCount,
      meanChannelDelta: totalChannelDelta / (pixelCount * 4),
    };
  }, {
    firstPng: first.toString('base64'),
    secondPng: second.toString('base64'),
  });
}
