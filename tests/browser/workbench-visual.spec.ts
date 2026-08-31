import {
  expect,
  type Page,
  test,
} from '@playwright/test';

import { readCanvasMetrics } from './support/renderer';

const SCENES = [
  'S001',
  'S002',
  'S003',
  'S004',
  'S005',
  'S006',
  'S007',
  'S008',
  'S009',
  'S010',
  'S011',
  'S012',
] as const;

const LAYOUT_CASES = [
  { width: 1440, height: 900, scenes: SCENES },
  { width: 1024, height: 768, scenes: ['S001', 'S002', 'S008', 'S012'] },
  { width: 390, height: 844, scenes: SCENES },
  { width: 360, height: 800, scenes: ['S001', 'S002', 'S008', 'S012'] },
] as const;

const VISUAL_CASES = [
  { width: 1440, height: 900, scene: 'S001', name: 'lab-desktop' },
  { width: 1024, height: 768, scene: 'S002', name: 'materials-compact' },
  { width: 390, height: 844, scene: 'S008', name: 'composition-mobile' },
  { width: 360, height: 800, scene: 'S012', name: 'lifecycle-mobile' },
] as const;

test('keeps every workbench scene usable across the acceptance viewports', async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const layout of LAYOUT_CASES) {
    await page.setViewportSize({
      width: layout.width,
      height: layout.height,
    });
    for (const scene of layout.scenes) {
      await page.goto(`/?test=1&framework=vue&scene=${scene}`, {
        waitUntil: 'domcontentloaded',
      });
      await waitForReady(page);
      await expect(page.getByTestId('scene-select')).toHaveValue(scene);
      await expect(page.locator('.stage')).toBeVisible();
      await expect(page.locator('.inspector')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectRenderedPresentation(page, scene);
    }
  }
});

test('matches the polished workbench at desktop and mobile sizes', async ({
  page,
}) => {
  test.skip(
    process.platform !== 'win32',
    'Workbench screenshot baselines are calibrated for Windows Chrome.',
  );
  test.setTimeout(60_000);
  for (const visual of VISUAL_CASES) {
    await page.setViewportSize({
      width: visual.width,
      height: visual.height,
    });
    await page.goto(`/?test=1&framework=vue&scene=${visual.scene}`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForReady(page);
    if (visual.scene === 'S012') {
      await page.locator('[data-scene-actions="S012"]').scrollIntoViewIfNeeded();
    }
    await expect(page).toHaveScreenshot(`${visual.name}.png`, {
      animations: 'disabled',
      caret: 'hide',
      mask: [page.locator('.diagnostics')],
      maskColor: '#222e2c',
      maxDiffPixelRatio: 0.005,
    });
  }
});

async function waitForReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', {
    timeout: 15_000,
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const evidence = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const visible = (element: Element): boolean => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    };
    const controlsOutsideViewport = [
      ...document.querySelectorAll('button, input, output, select'),
    ]
      .filter(visible)
      .flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > viewportWidth + 1
          ? [element.getAttribute('aria-label')
            ?? element.getAttribute('data-action')
            ?? element.tagName]
          : [];
      });
    const clippedText = [
      ...document.querySelectorAll(
        'button, dd, dt, output, .material-copy strong, .material-copy small',
      ),
    ]
      .filter(visible)
      .flatMap((element) => {
        const style = getComputedStyle(element);
        return element.scrollWidth > element.clientWidth + 1
          && style.textOverflow !== 'ellipsis'
          ? [{
              clientWidth: element.clientWidth,
              dataAction: element.getAttribute('data-action'),
              dataLabSource: element.getAttribute('data-lab-source'),
              id: element.id || null,
              scene: document.querySelector('#app')?.getAttribute('data-scene'),
              scrollWidth: element.scrollWidth,
              tagName: element.tagName,
              text: element.textContent?.trim() || element.tagName,
              viewportWidth,
            }]
          : [];
      });
    return {
      controlsOutsideViewport,
      clippedText,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth,
    };
  });

  expect(evidence.documentWidth).toBeLessThanOrEqual(evidence.viewportWidth);
  expect(evidence.controlsOutsideViewport).toEqual([]);
  expect(evidence.clippedText).toEqual([]);
}

async function expectRenderedPresentation(
  page: Page,
  scene: typeof SCENES[number],
): Promise<void> {
  const materials = page.locator('.liquid-glass-material');
  await expect(materials.first()).toBeVisible();
  if (scene === 'S007') {
    await expect(page.locator('#app')).toHaveAttribute('data-fallback', 'on');
    return;
  }

  const canvases = page.locator(
    '.liquid-glass-canvas, .liquid-glass-dedicated-canvas',
  );
  const coverage: number[] = [];
  for (const canvas of await canvases.all()) {
    coverage.push((await readCanvasMetrics(canvas)).nonTransparentPixels);
  }
  expect(Math.max(...coverage)).toBeGreaterThan(1_000);
}
