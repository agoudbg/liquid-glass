import { expect, test } from '@playwright/test';

import {
  capturePrimaryMaterial,
  comparePngPixels,
  readCanvasMetrics,
  readNumericAttribute,
} from './support/renderer';

const FRAMEWORKS = ['vue', 'react', 'solid'] as const;
const SCENES = ['S001', 'S002'] as const;

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

      const canvasMetrics = await readCanvasMetrics(
        page.locator('.liquid-glass-canvas'),
      );

      expect(canvasMetrics.width).toBeGreaterThan(0);
      expect(canvasMetrics.height).toBeGreaterThan(0);
      expect(canvasMetrics.nonTransparentPixels).toBeGreaterThan(1_000);
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
    expect(difference.meanChannelDelta).toBeGreaterThan(1);
  }

  expect(runtimeErrors).toEqual([]);
});

test('captures, mutates, and manually refreshes DOM through every adapter', async ({
  page,
}) => {
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
    await page.goto(
      `/?test=1&framework=${framework}&scene=S003&content=source`,
      { waitUntil: 'domcontentloaded' },
    );
    const shell = page.locator('#app');
    const converter = page.locator('.liquid-glass-backdrop-converter');
    const copy = page.getByTestId('dom-capture-copy');
    const refreshButton = page.locator('[data-action="refresh-backdrop"]');
    await expect(shell).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
    await expect(shell).toHaveAttribute('data-gl-error', 'NO_ERROR');
    await expect(converter).toHaveCount(1);
    const image = page.getByTestId('dom-capture-image');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element) => (
      element instanceof HTMLImageElement
      && element.complete
      && element.naturalWidth > 0
    ))).toBe(true);
    await expect(copy).toHaveAttribute('data-dom-phase', 'source');
    await expect(refreshButton).toBeEnabled();
    await expect.poll(() => readNumericAttribute(shell, 'data-capture-count'), {
      timeout: 15_000,
    }).toBeGreaterThan(0);
    await converter.evaluate((element) => {
      Reflect.set(window, '__liquidGlassBackdropProbe', element);
    });

    const sourceCapture = await capturePrimaryMaterial(page);
    const sourceCaptureCount = await readNumericAttribute(
      shell,
      'data-capture-count',
    );
    await page.locator('[data-action="mutate-dom"]').click();
    await expect(copy).toHaveAttribute('data-dom-phase', 'mutated');
    await expect(copy).toContainText('Alpine afterglow');
    await expect.poll(() => readNumericAttribute(shell, 'data-capture-count'), {
      timeout: 15_000,
    }).toBeGreaterThan(sourceCaptureCount);
    expect(await converter.evaluate((element) => (
      Reflect.get(window, '__liquidGlassBackdropProbe') === element
    ))).toBe(true);

    const mutatedCapture = await capturePrimaryMaterial(page);
    const difference = await comparePngPixels(page, sourceCapture, mutatedCapture);
    expect(difference.changedPixelRatio).toBeGreaterThan(0.02);
    expect(difference.meanChannelDelta).toBeGreaterThan(0.5);
    const mutatedCaptureCount = await readNumericAttribute(
      shell,
      'data-capture-count',
    );
    await refreshButton.click();
    await expect.poll(() => readNumericAttribute(shell, 'data-capture-count'), {
      timeout: 15_000,
    }).toBeGreaterThan(mutatedCaptureCount);

    const canvasMetrics = await readCanvasMetrics(page.locator('.liquid-glass-canvas'));
    expect(canvasMetrics.nonTransparentPixels).toBeGreaterThan(1_000);
  }

  expect(runtimeErrors).toEqual([]);
});

test('forces and recovers CSS fallback through every public adapter', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  for (const framework of FRAMEWORKS) {
    await page.goto(
      `/?test=1&framework=${framework}&scene=S007&fallback=on`,
      { waitUntil: 'domcontentloaded' },
    );
    const shell = page.locator('#app');
    const context = page.locator('.glass-context');
    const material = page.getByTestId('primary-material');
    const canvas = page.locator('.liquid-glass-canvas');
    await expect(shell).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
    await expect(shell).toHaveAttribute('data-scene', 'S007');
    await expect(shell).toHaveAttribute('data-fallback', 'on');
    await expect(context).toHaveAttribute('data-lg-fallback', 'true');
    await expect(material).toHaveAttribute('is-fallback-mode', 'true');
    await expect(canvas).toHaveCSS('visibility', 'hidden');
    await expect(canvas).toHaveCSS('opacity', '0');
    await expect(material).toHaveCSS('backdrop-filter', /blur\(6px\)/);
    const fallbackCapture = await capturePrimaryMaterial(page);
    const fallbackBounds = await material.boundingBox();
    if (!fallbackBounds) throw new Error('Fallback material has no measurable bounds.');
    await material.evaluate((element) => {
      Reflect.set(window, '__liquidGlassMaterialProbe', element);
    });

    await page.locator('[data-fallback-mode="webgl"]').click();
    await expect(shell).toHaveAttribute('data-fallback', 'off');
    await expect(context).toHaveAttribute('data-lg-fallback', 'false');
    await expect(material).toHaveAttribute('is-fallback-mode', 'false');
    expect(await material.evaluate((element) => (
      Reflect.get(window, '__liquidGlassMaterialProbe') === element
    ))).toBe(true);
    await expect(canvas).toHaveCSS('visibility', 'visible');
    await expect(canvas).toHaveCSS('opacity', '1');
    await expect(page).toHaveURL(/fallback=off/);

    const canvasMetrics = await readCanvasMetrics(canvas);
    expect(canvasMetrics.nonTransparentPixels).toBeGreaterThan(1_000);
    const webGlBounds = await material.boundingBox();
    if (!webGlBounds) throw new Error('WebGL material has no measurable bounds.');
    for (const dimension of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(webGlBounds[dimension] - fallbackBounds[dimension]))
        .toBeLessThan(1);
    }
    const webGlCapture = await capturePrimaryMaterial(page);
    const difference = await comparePngPixels(page, fallbackCapture, webGlCapture);
    expect(difference.changedPixelRatio).toBeGreaterThan(0.02);
    expect(difference.meanChannelDelta).toBeGreaterThan(0.5);
  }

  expect(runtimeErrors).toEqual([]);
});
