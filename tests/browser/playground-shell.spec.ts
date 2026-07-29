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

test('scrolls the inspector and applies global render precision everywhere', async ({
  page,
}) => {
  await page.goto('/?test=1&framework=vue&scene=S001&precision=1', {
    waitUntil: 'domcontentloaded',
  });
  const shell = page.locator('#app');
  const inspector = page.locator('.inspector');
  const canvas = page.locator('.liquid-glass-canvas');
  await expect(shell).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });

  const layout = await inspector.evaluate((element) => {
    const workbench = document.querySelector('.playground-shell');
    if (!workbench) throw new Error('Missing playground shell.');
    element.scrollTop = element.scrollHeight;
    return {
      bodyScrollHeight: document.body.scrollHeight,
      clientHeight: element.clientHeight,
      innerHeight: window.innerHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
      workbenchHeight: workbench.getBoundingClientRect().height,
    };
  });
  expect(layout.workbenchHeight).toBe(layout.innerHeight);
  expect(layout.bodyScrollHeight).toBe(layout.innerHeight);
  expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);
  expect(layout.scrollTop).toBe(layout.scrollHeight - layout.clientHeight);

  const precision = page.locator('[data-render-precision-control]');
  await precision.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error('Render precision control is not an input.');
    }
    element.value = '1.5';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(shell).toHaveAttribute('data-render-precision', '1.5');
  await expect(page).toHaveURL(/precision=1\.5/);
  await expect(page.locator('[data-render-precision-output]')).toHaveText('1.50x');
  await expect(page.locator('#diagnostic-fps')).toContainText('fps');

  const debugToggle = page.locator('[data-debug-toggle]');
  await expect(debugToggle).toBeChecked();
  await debugToggle.uncheck();
  await expect(shell).toHaveAttribute('data-debug', 'off');
  await expect(page).toHaveURL(/debug=off/);
  await expect(page.locator('#diagnostic-fps')).toHaveText('--');
  await debugToggle.check();
  await expect(shell).toHaveAttribute('data-debug', 'on');
  await expect(page).toHaveURL(/debug=on/);

  const expectPrecision = async (): Promise<void> => {
    await expect.poll(() => canvas.evaluate((element) => (
      element.width === Math.round(element.getBoundingClientRect().width * 1.5)
      && element.height === Math.round(element.getBoundingClientRect().height * 1.5)
    ))).toBe(true);
    const dimensions = await canvas.evaluate((element) => ({
      actualHeight: element.height,
      actualWidth: element.width,
      expectedHeight: Math.round(element.getBoundingClientRect().height * 1.5),
      expectedWidth: Math.round(element.getBoundingClientRect().width * 1.5),
    }));
    expect(dimensions.actualWidth).toBe(dimensions.expectedWidth);
    expect(dimensions.actualHeight).toBe(dimensions.expectedHeight);
  };
  await expectPrecision();

  await page.getByTestId('scene-select').selectOption('S002');
  await expect(shell).toHaveAttribute('data-scene', 'S002');
  await expectPrecision();

  for (const framework of ['react', 'solid'] as const) {
    await page.getByRole('button', {
      exact: true,
      name: framework === 'react' ? 'React' : 'Solid',
    }).click();
    await expect(shell).toHaveAttribute('data-framework', framework);
    await expect(shell).toHaveAttribute('data-ready', 'true');
    await expect(shell).toHaveAttribute('data-render-precision', '1.5');
    await expect(shell).toHaveAttribute('data-debug', 'on');
    await expectPrecision();
  }
});

test('switches the global presentation mode through every adapter', async ({
  page,
}) => {
  await page.goto('/?test=1&framework=vue&scene=S002&mode=uniform', {
    waitUntil: 'domcontentloaded',
  });
  const shell = page.locator('#app');
  await expect(shell).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  await expect(page.locator('.liquid-glass-dedicated-canvas')).toHaveCount(0);

  await page.locator('[data-render-mode="dedicated"]').click();
  await expect(shell).toHaveAttribute('data-render-mode', 'dedicated');
  await expect(page).toHaveURL(/mode=dedicated/);
  await expect(page.locator('#render-mode-fact')).toHaveText('Dedicated');
  await expect(page.locator('.liquid-glass-dedicated-canvas')).toHaveCount(3);

  for (const framework of ['react', 'solid'] as const) {
    await page.getByRole('button', {
      exact: true,
      name: framework === 'react' ? 'React' : 'Solid',
    }).click();
    await expect(shell).toHaveAttribute('data-framework', framework);
    await expect(shell).toHaveAttribute('data-ready', 'true');
    await expect(shell).toHaveAttribute('data-render-mode', 'dedicated');
    await expect(page.locator('.liquid-glass-dedicated-canvas')).toHaveCount(3);
  }

  await page.locator('[data-render-mode="uniform"]').click();
  await expect(shell).toHaveAttribute('data-render-mode', 'uniform');
  await expect(page.locator('.liquid-glass-dedicated-canvas')).toHaveCount(0);
});

test('preserves Lab state through keyboard tabs and framework remounts', async ({
  page,
}) => {
  await page.goto('/?test=1&framework=vue&scene=S001&thickness=36', {
    waitUntil: 'domcontentloaded',
  });
  const shell = page.locator('#app');
  await expect(shell).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  const thickness = page.locator('[data-lab-number="thickness"]');
  await thickness.fill('62');
  await thickness.dispatchEvent('input');
  await expect(page).toHaveURL(/thickness=62/);

  await page.getByRole('button', { exact: true, name: 'React' }).click();
  await expect(shell).toHaveAttribute('data-framework', 'react');
  await expect(shell).toHaveAttribute('data-ready', 'true');
  await expect(thickness).toHaveValue('62');

  const labTab = page.getByRole('tab', { name: 'Lab' });
  await labTab.focus();
  await labTab.press('ArrowRight');
  const compositionTab = page.getByRole('tab', { name: 'Composition' });
  await expect(compositionTab).toBeFocused();
  await expect(compositionTab).toHaveAttribute('aria-selected', 'true');
  await expect(shell).toHaveAttribute('data-scene', 'S008');

  await compositionTab.press('ArrowLeft');
  await expect(labTab).toBeFocused();
  await expect(shell).toHaveAttribute('data-scene', 'S001');
  await expect(thickness).toHaveValue('62');

  await page.getByTestId('scene-select').selectOption('S012');
  await expect(shell).toHaveAttribute('data-scene', 'S012');
  for (const action of [
    'Remount context',
    'Lose WebGL context',
    'Restore WebGL context',
  ]) {
    const button = page.getByRole('button', { name: action });
    await expect(button).toHaveAttribute('title', action);
  }
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
    await expect(page.locator('#diagnostic-capture')).toContainText('ms');
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
