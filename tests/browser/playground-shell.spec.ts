import { expect, type Page, test } from '@playwright/test';

const FRAMEWORKS = ['vue', 'react', 'solid'] as const;
const SCENES = ['S001', 'S002'] as const;

interface PixelDifference {
  changedPixelRatio: number;
  meanChannelDelta: number;
}

test('renders S001 and S002 through every public framework adapter', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error'
      && !message.text().startsWith('Failed to load resource:')
    ) {
      runtimeErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  for (const framework of FRAMEWORKS) {
    for (const scene of SCENES) {
      await page.goto(
        `/?test=1&framework=${framework}&scene=${scene}&glass=on`,
        { waitUntil: 'domcontentloaded' },
      );

      const shell = page.locator('#app');
      await expect(shell).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
      await expect(shell).toHaveAttribute('data-framework', framework);
      await expect(shell).toHaveAttribute('data-scene', scene);
      await expect(shell).toHaveAttribute('data-gl-error', 'NO_ERROR');
      await expect(page.getByTestId('gl-status')).toHaveText('WebGL2 ready');
      await expect(page.locator('.liquid-glass-material')).toHaveCount(
        scene === 'S001' ? 1 : 3,
      );

      const canvasMetrics = await page
        .locator('.liquid-glass-canvas')
        .evaluate((element) => {
          if (!(element instanceof HTMLCanvasElement)) {
            throw new Error('Expected the core-owned presentation canvas.');
          }
          const gl = element.getContext('webgl2');
          if (!gl) throw new Error('Expected a WebGL2 rendering context.');
          const pixels = new Uint8Array(element.width * element.height * 4);
          gl.readPixels(
            0,
            0,
            element.width,
            element.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels,
          );
          let nonTransparentPixels = 0;
          for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index] !== 0) nonTransparentPixels += 1;
          }
          return {
            width: element.width,
            height: element.height,
            nonTransparentPixels,
            glError: gl.getError(),
          };
        });

      expect(canvasMetrics.width).toBeGreaterThan(0);
      expect(canvasMetrics.height).toBeGreaterThan(0);
      expect(canvasMetrics.nonTransparentPixels).toBeGreaterThan(1_000);
      expect(canvasMetrics.glError).toBe(0);
    }

    await page.goto(
      `/?test=1&framework=${framework}&scene=S001&glass=on`,
      { waitUntil: 'domcontentloaded' },
    );
    const shell = page.locator('#app');
    await expect(shell).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
    const glassOn = await capturePrimaryMaterial(page);

    await page.getByTestId('glass-toggle').click();
    await expect(shell).toHaveAttribute('data-glass', 'off');
    await expect(page.locator('.glass-context')).toHaveAttribute(
      'data-glass-enabled',
      'false',
    );
    const glassOff = await capturePrimaryMaterial(page);
    const difference = await comparePngPixels(page, glassOn, glassOff);

    expect(difference.changedPixelRatio).toBeGreaterThan(0.08);
    expect(difference.meanChannelDelta).toBeGreaterThan(2);
  }

  expect(runtimeErrors).toEqual([]);
});

async function capturePrimaryMaterial(page: Page): Promise<Buffer> {
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

async function comparePngPixels(
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
