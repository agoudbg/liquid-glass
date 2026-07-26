import { expect, type Page, test } from '@playwright/test';

import {
  comparePngPixels,
  readCanvasMetrics,
  readElementRect,
  readNumericAttribute,
  waitForStableCaptureCount,
} from './support/renderer';

const FRAMEWORKS = ['vue', 'react', 'solid'] as const;

test('keeps body-scroll glass fixed without recapturing the full DOM source', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const runtimeErrors = collectRuntimeErrors(page);

  for (const framework of FRAMEWORKS) {
    await page.goto(
      `/?test=1&framework=${framework}&scene=S005&scroll=off&viewport=off`,
      { waitUntil: 'domcontentloaded' },
    );
    const shell = page.locator('#app');
    const context = page.locator('.glass-context');
    const converter = page.locator('.body-scroll-backdrop');
    const canvas = page.locator('.liquid-glass-canvas');
    const material = page.getByTestId('primary-material');
    await expect(shell).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
    await expect(shell).toHaveAttribute('data-gl-error', 'NO_ERROR');
    await expect(context).toHaveAttribute('data-lg-scrollable', 'false');
    await expect(material).toHaveCSS('position', 'fixed');
    await expect(page.locator('.viewport-control')).toBeHidden();

    const sourceSize = await converter.evaluate((element) => ({
      width: element.scrollWidth,
      height: element.scrollHeight,
    }));
    expect(sourceSize.height).toBe(1_600);
    const captureCount = await waitForStableCaptureCount(page, shell);
    expect(await readNumericAttribute(shell, 'data-capture-height'))
      .toBeCloseTo(sourceSize.height, 0);
    expect(await readNumericAttribute(shell, 'data-capture-bitmap-height'))
      .toBeCloseTo(sourceSize.height, 0);
    const frameCount = await readNumericAttribute(shell, 'data-frame-count');
    const initialMaterialRect = await readElementRect(material);
    const initialCanvasRect = await readElementRect(canvas);
    const initialGlass = await material.screenshot({ animations: 'disabled' });

    await page.evaluate(() => window.scrollTo(0, 420));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(419);
    await expect.poll(() => readNumericAttribute(shell, 'data-frame-count'))
      .toBeGreaterThan(frameCount);
    await page.waitForTimeout(5_500);
    await expect(shell).toHaveAttribute('data-ready', 'true');
    await expect(shell).toHaveAttribute('data-gl-error', 'NO_ERROR');
    expect(await readNumericAttribute(shell, 'data-capture-count')).toBe(captureCount);

    const scrolledMaterialRect = await readElementRect(material);
    const scrolledCanvasRect = await readElementRect(canvas);
    expectRectToMatch(scrolledMaterialRect, initialMaterialRect);
    expect(Math.abs(
      scrolledCanvasRect.y - initialCanvasRect.y + 420,
    )).toBeLessThan(1);
    const scrolledGlass = await material.screenshot({ animations: 'disabled' });
    const difference = await comparePngPixels(page, initialGlass, scrolledGlass);
    expect(difference.changedPixelRatio).toBeGreaterThan(0.02);
    expect(difference.meanChannelDelta).toBeGreaterThan(0.5);

    const canvasMetrics = await readCanvasMetrics(canvas);
    expect(canvasMetrics.nonTransparentPixels).toBeGreaterThan(1_000);
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  expect(runtimeErrors).toEqual([]);
});

test('reuses and renews bounded captures while an internal surface scrolls', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const runtimeErrors = collectRuntimeErrors(page);

  for (const framework of FRAMEWORKS) {
    await page.goto(
      `/?test=1&framework=${framework}&scene=S006&scroll=on&viewport=on`,
      { waitUntil: 'domcontentloaded' },
    );
    const shell = page.locator('#app');
    const context = page.locator('.glass-context');
    const scrollSurface = page.locator(
      '.glass-context > .liquid-glass-content.scrollable',
    );
    const converter = page.locator('.internal-scroll-backdrop');
    const canvas = page.locator('.liquid-glass-canvas');
    const material = page.getByTestId('primary-material');
    await expect(shell).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
    await expect(shell).toHaveAttribute('data-gl-error', 'NO_ERROR');
    await expect(shell).toHaveAttribute('data-viewport-request', 'on');
    await expect(context).toHaveAttribute('data-lg-scrollable', 'true');
    await expect(context).toHaveCSS('overflow', 'hidden');
    await expect(scrollSurface).toHaveCSS('overflow', 'auto');
    await expect(material).toHaveCSS('position', 'sticky');
    await expect(page.locator('.viewport-control')).toBeVisible();

    const surfaceSize = await scrollSurface.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    const sourceHeight = await converter.evaluate((element) => element.scrollHeight);
    expect(surfaceSize.scrollHeight).toBeGreaterThan(surfaceSize.clientHeight);
    expect(sourceHeight).toBe(1_600);
    const captureCount = await waitForStableCaptureCount(page, shell);
    expect(await readNumericAttribute(shell, 'data-capture-height'))
      .toBeLessThan(sourceHeight);
    expect(await readNumericAttribute(shell, 'data-capture-bitmap-height'))
      .toBeLessThan(sourceHeight);
    const initialMaterialRect = await readElementRect(material);
    const initialGlass = await material.screenshot({ animations: 'disabled' });
    const initialFrameCount = await readNumericAttribute(shell, 'data-frame-count');

    await scrollSurface.evaluate((element) => element.scrollTo(0, 60));
    await expect.poll(() => scrollSurface.evaluate((element) => element.scrollTop))
      .toBe(60);
    await expect.poll(() => readNumericAttribute(shell, 'data-frame-count'))
      .toBeGreaterThan(initialFrameCount);
    await expect(canvas).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 60)');
    expectRectToMatch(await readElementRect(material), initialMaterialRect);
    expectRectToMatch(
      await readElementRect(canvas),
      await readElementRect(scrollSurface),
    );
    await page.waitForTimeout(5_500);
    await expect(shell).toHaveAttribute('data-ready', 'true');
    await expect(shell).toHaveAttribute('data-gl-error', 'NO_ERROR');
    expect(await readNumericAttribute(shell, 'data-capture-count')).toBe(captureCount);

    await scrollSurface.evaluate((element) => element.scrollTo(0, 360));
    await expect.poll(() => readNumericAttribute(shell, 'data-capture-count'), {
      timeout: 15_000,
    }).toBeGreaterThan(captureCount);
    await waitForStableCaptureCount(page, shell);
    expect(await readNumericAttribute(shell, 'data-capture-y')).toBeGreaterThan(0);
    const captureWidth = await readNumericAttribute(shell, 'data-capture-width');
    const captureHeight = await readNumericAttribute(shell, 'data-capture-height');
    const bitmapWidth = await readNumericAttribute(shell, 'data-capture-bitmap-width');
    const bitmapHeight = await readNumericAttribute(shell, 'data-capture-bitmap-height');
    expect(Math.abs(bitmapWidth - captureWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(bitmapHeight - captureHeight)).toBeLessThanOrEqual(1);
    expect(captureHeight).toBeLessThan(sourceHeight);
    await expect(canvas).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 360)');
    expectRectToMatch(await readElementRect(material), initialMaterialRect);
    expectRectToMatch(
      await readElementRect(canvas),
      await readElementRect(scrollSurface),
    );

    const scrolledGlass = await material.screenshot({ animations: 'disabled' });
    const difference = await comparePngPixels(page, initialGlass, scrolledGlass);
    expect(difference.changedPixelRatio).toBeGreaterThan(0.02);
    expect(difference.meanChannelDelta).toBeGreaterThan(0.5);

    const boundedCount = await readNumericAttribute(shell, 'data-capture-count');
    await page.locator('[data-viewport-mode="full"]').click();
    await expect(shell).toHaveAttribute('data-viewport-request', 'off');
    await expect(page).toHaveURL(/viewport=off/);
    await expect.poll(() => readNumericAttribute(shell, 'data-capture-count'), {
      timeout: 15_000,
    }).toBeGreaterThan(boundedCount);
    await expect.poll(() => readNumericAttribute(shell, 'data-capture-height'), {
      timeout: 15_000,
    }).toBeCloseTo(sourceHeight, 0);
    await waitForStableCaptureCount(page, shell);

    const fullLayout = await readFullContentLayout(
      canvas,
      material,
      scrollSurface,
    );
    expect(fullLayout.canvasTransform).toBe('none');
    expect(fullLayout.canvasBackingWidth).toBeCloseTo(
      fullLayout.surfaceScrollWidth,
      0,
    );
    expect(fullLayout.canvasBackingHeight).toBeCloseTo(
      fullLayout.surfaceScrollHeight,
      0,
    );
    expect(fullLayout.canvasRect.width).toBeCloseTo(
      fullLayout.surfaceScrollWidth,
      0,
    );
    expect(fullLayout.canvasRect.height).toBeCloseTo(
      fullLayout.surfaceScrollHeight,
      0,
    );
    expect(fullLayout.canvasRect.y).toBeCloseTo(
      fullLayout.surfaceRect.y - fullLayout.surfaceScrollTop,
      0,
    );
    expectRectToMatch(fullLayout.materialRect, initialMaterialRect);

    const fullHeight = fullLayout.canvasRect.height;
    const fullCount = await readNumericAttribute(shell, 'data-capture-count');
    await shell.evaluate((element) => {
      element.style.setProperty('--scroll-source-height', '1200px');
      window.dispatchEvent(new Event('resize'));
    });
    await expect.poll(() => converter.evaluate((element) => element.scrollHeight), {
      timeout: 15_000,
    }).toBe(1_200);
    await expect.poll(() => readNumericAttribute(shell, 'data-capture-count'), {
      timeout: 15_000,
    }).toBeGreaterThan(fullCount);
    await waitForStableCaptureCount(page, shell);

    const shrunkenLayout = await readFullContentLayout(
      canvas,
      material,
      scrollSurface,
    );
    expect(shrunkenLayout.canvasRect.height).toBeLessThan(fullHeight);
    expect(shrunkenLayout.canvasRect.height).toBeCloseTo(
      shrunkenLayout.surfaceScrollHeight,
      0,
    );
    expect(shrunkenLayout.canvasBackingHeight).toBeCloseTo(
      shrunkenLayout.surfaceScrollHeight,
      0,
    );
    expect(shrunkenLayout.canvasTransform).toBe('none');
    expectRectToMatch(shrunkenLayout.materialRect, initialMaterialRect);

    const shrunkenCount = await readNumericAttribute(shell, 'data-capture-count');
    await page.locator('[data-viewport-mode="bounded"]').click();
    await expect(shell).toHaveAttribute('data-viewport-request', 'on');
    await expect(page).toHaveURL(/viewport=on/);
    await expect.poll(() => readNumericAttribute(shell, 'data-capture-count'), {
      timeout: 15_000,
    }).toBeGreaterThan(shrunkenCount);
    await expect.poll(() => readNumericAttribute(shell, 'data-capture-height'), {
      timeout: 15_000,
    }).toBeLessThan(sourceHeight);

    const canvasMetrics = await readCanvasMetrics(canvas);
    expect(canvasMetrics.nonTransparentPixels).toBeGreaterThan(1_000);
  }

  expect(runtimeErrors).toEqual([]);
});

test('keeps mobile scroll scenes ordered without wrapped labels or overlays', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?test=1&framework=vue&scene=S005', {
    waitUntil: 'domcontentloaded',
  });
  const shell = page.locator('#app');
  await expect(shell).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  const bodyScrollTarget = await page.evaluate(() => Math.min(
    1_550,
    document.documentElement.scrollHeight - window.innerHeight,
  ));
  await page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), bodyScrollTarget);
  await expect.poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(bodyScrollTarget, 0);

  const bodyLayout = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.stage');
    const inspector = document.querySelector<HTMLElement>('.inspector');
    const diagnostics = document.querySelector<HTMLElement>('.diagnostics');
    if (!stage || !inspector || !diagnostics) {
      throw new Error('Missing mobile workbench regions.');
    }
    const stageRect = stage.getBoundingClientRect();
    const inspectorRect = inspector.getBoundingClientRect();
    const diagnosticsRect = diagnostics.getBoundingClientRect();
    return {
      stageBottom: stageRect.bottom,
      inspectorTop: inspectorRect.top,
      inspectorBottom: inspectorRect.bottom,
      diagnosticsTop: diagnosticsRect.top,
      inspectorOwnsOverlap:
        document.elementFromPoint(195, inspectorRect.top + 36)?.closest('.inspector')
          !== null,
    };
  });
  expect(Math.abs(bodyLayout.stageBottom - bodyLayout.inspectorTop)).toBeLessThan(1);
  expect(Math.abs(bodyLayout.inspectorBottom - bodyLayout.diagnosticsTop)).toBeLessThan(1);
  expect(bodyLayout.inspectorOwnsOverlap).toBe(true);

  await page.goto('/?test=1&framework=vue&scene=S006', {
    waitUntil: 'domcontentloaded',
  });
  await expect(shell).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  const internalLayout = await page.evaluate(() => ({
    labelHeights: Array.from(document.querySelectorAll<HTMLElement>(
      '.scroll-band > span',
    ), (element) => element.getBoundingClientRect().height),
    horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(internalLayout.labelHeights).toHaveLength(10);
  expect(Math.max(...internalLayout.labelHeights)).toBeLessThan(15);
  expect(internalLayout.horizontalOverflow).toBeLessThanOrEqual(0);
  await expect(page.locator('.viewport-control')).toBeVisible();
});

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error'
      && !message.text().startsWith('Failed to load resource:')
    ) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

function expectRectToMatch(
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number },
): void {
  for (const dimension of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(actual[dimension] - expected[dimension])).toBeLessThan(1);
  }
}

async function readFullContentLayout(
  canvas: ReturnType<Page['locator']>,
  material: ReturnType<Page['locator']>,
  scrollSurface: ReturnType<Page['locator']>,
): Promise<{
  canvasBackingHeight: number;
  canvasBackingWidth: number;
  canvasRect: { x: number; y: number; width: number; height: number };
  canvasTransform: string;
  materialRect: { x: number; y: number; width: number; height: number };
  surfaceRect: { x: number; y: number; width: number; height: number };
  surfaceScrollHeight: number;
  surfaceScrollTop: number;
  surfaceScrollWidth: number;
}> {
  const [canvasState, materialRect, surfaceState] = await Promise.all([
    canvas.evaluate((element) => {
      if (!(element instanceof HTMLCanvasElement)) {
        throw new Error('Expected the core-owned presentation canvas.');
      }
      const rect = element.getBoundingClientRect();
      return {
        backingHeight: element.height,
        backingWidth: element.width,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        transform: getComputedStyle(element).transform,
      };
    }),
    readElementRect(material),
    scrollSurface.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
        scrollWidth: element.scrollWidth,
      };
    }),
  ]);
  return {
    canvasBackingHeight: canvasState.backingHeight,
    canvasBackingWidth: canvasState.backingWidth,
    canvasRect: canvasState.rect,
    canvasTransform: canvasState.transform,
    materialRect,
    surfaceRect: surfaceState.rect,
    surfaceScrollHeight: surfaceState.scrollHeight,
    surfaceScrollTop: surfaceState.scrollTop,
    surfaceScrollWidth: surfaceState.scrollWidth,
  };
}
