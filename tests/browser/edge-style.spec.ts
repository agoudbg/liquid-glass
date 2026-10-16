import { expect, type Locator, type Page, test } from '@playwright/test';

import { collectRuntimeErrors, expectRectClose } from './support/interaction';
import {
  decodeLegacyComparisonPng,
  type LegacyRgbaImage,
} from './support/legacy-png';
import { readElementRect } from './support/renderer';

const FRAMEWORKS = ['vue', 'react', 'solid'] as const;

for (const framework of FRAMEWORKS) {
  test(`switches edge appearance without changing material geometry in ${framework}`, async ({
    page,
  }, testInfo) => {
    const runtimeErrors = collectRuntimeErrors(page);
    await page.goto(`/?test=1&framework=${framework}&scene=S001`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', {
      timeout: 15_000,
    });
    await page.mouse.move(8, 8);

    const material = page.getByTestId('primary-material');
    const edge = page.locator('[data-lab-edge-style]');
    const angle = page.locator('[data-lab-number="illuminationAngle"]');
    const intensity = page.locator('[data-lab-number="illuminationIntensity"]');
    await expect(edge).toHaveValue('illuminated');
    await expect(material).toHaveAttribute('data-edge-style', 'illuminated');
    await expect(angle).toBeEnabled();
    const originalRect = await readElementRect(material);
    expect((await readEdgePresentation(material)).contourGradient)
      .toContain('conic-gradient');

    await edge.selectOption('dark');
    await expect(material).toHaveAttribute('data-edge-style', 'dark');
    await expect(page).toHaveURL(/edgeStyle=dark/u);
    await expect(angle).toBeDisabled();
    await expect(intensity).toBeEnabled();
    await expect.poll(async () => (await readEdgePresentation(material)).contourShadow)
      .toContain('inset');
    const dark = await readEdgePresentation(material);
    expect(dark.contourShadow).toMatch(/rgba?\(0, 0, 0[,)]/u);
    expect(dark.contourGradient).toBe('none');
    expect(dark.reflection).toContain('linear-gradient');
    expect(dark.reflection).not.toContain('conic-gradient');
    expect(dark.reflectionContent).not.toBe('none');
    expect(dark.reflectionVisibility).toBe('visible');
    expect(dark.reflectionOpacity).toBeGreaterThan(0);
    expect(dark.reflectionTransform).toBe('none');
    expectRectClose(await readElementRect(material), originalRect, 0.1);

    await page.screenshot({
      path: testInfo.outputPath(`dark-edge-${framework}-desktop.png`),
      animations: 'disabled',
      mask: [page.locator('.diagnostics')],
      maskColor: '#222e2c',
    });
    await expectDirectionalContourPixels(page);
    if (framework === 'vue') {
      await page.locator('[data-lab-number="radius"]').evaluate((element) => {
        if (!(element instanceof HTMLInputElement)) {
          throw new Error('Shared radius control is not an input.');
        }
        element.value = '200';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await expect(page.locator('[data-lab-number="radiusTL"]')).toHaveValue('200');
      await expect(page.locator('[data-lab-number="radiusBR"]')).toHaveValue('200');
      await expectDirectionalContourPixels(page);
      await page.screenshot({
        path: testInfo.outputPath('dark-edge-vue-capsule-desktop.png'),
        animations: 'disabled',
        mask: [page.locator('.diagnostics')],
        maskColor: '#222e2c',
      });
    }

    await intensity.evaluate((element) => {
      if (!(element instanceof HTMLInputElement)) {
        throw new Error('Illumination intensity control is not an input.');
      }
      element.value = '0.2';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect.poll(async () => (await readEdgePresentation(material)).reflection)
      .not.toBe(dark.reflection);
    expect((await readEdgePresentation(material)).contourShadow)
      .toBe(dark.contourShadow);
    expectRectClose(await readElementRect(material), originalRect, 0.1);

    await edge.selectOption('illuminated');
    await expect(material).toHaveAttribute('data-edge-style', 'illuminated');
    await expect(angle).toBeEnabled();
    await expect.poll(async () => (await readEdgePresentation(material)).contourGradient)
      .toContain('conic-gradient');
    const restored = await readEdgePresentation(material);
    expect(restored.contourShadow).toBe('none');
    expect(restored.reflectionContent).toBe('none');
    expect(restored.reflection).toBe('none');
    expectRectClose(await readElementRect(material), originalRect, 0.1);
    expect(runtimeErrors).toEqual([]);
  });
}

test('keeps the dark edge and its native selector within the mobile viewport', async ({
  page,
}, testInfo) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?test=1&framework=vue&scene=S001', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', {
    timeout: 15_000,
  });
  const edge = page.locator('[data-lab-edge-style]');
  await edge.selectOption('dark');
  await expect(page.getByTestId('primary-material'))
    .toHaveAttribute('data-edge-style', 'dark');
  await expect(edge).toBeVisible();

  const layout = await edge.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      left: rect.left,
      right: rect.right,
    };
  });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
  await page.screenshot({
    path: testInfo.outputPath('dark-edge-mobile.png'),
    animations: 'disabled',
    mask: [page.locator('.diagnostics')],
    maskColor: '#222e2c',
  });
  expect(runtimeErrors).toEqual([]);
});

interface EdgePresentation {
  contourGradient: string;
  contourShadow: string;
  reflection: string;
  reflectionContent: string;
  reflectionVisibility: string;
  reflectionOpacity: number;
  reflectionTransform: string;
}

async function readEdgePresentation(material: Locator): Promise<EdgePresentation> {
  return material.evaluate((element) => {
    const contour = getComputedStyle(element, '::before');
    const reflection = getComputedStyle(element, '::after');
    return {
      contourGradient: contour.backgroundImage,
      contourShadow: contour.boxShadow,
      reflection: reflection.backgroundImage,
      reflectionContent: reflection.content,
      reflectionVisibility: reflection.visibility,
      reflectionOpacity: Number(reflection.opacity),
      reflectionTransform: reflection.transform,
    };
  });
}

async function expectDirectionalContourPixels(page: Page): Promise<void> {
  const rect = await readElementRect(page.getByTestId('primary-material'));
  // Include every boundary pixel when fractional layout coordinates cross a pixel.
  const clip = {
    x: Math.floor(rect.x),
    y: Math.floor(rect.y),
    width: Math.ceil(rect.x + rect.width) - Math.floor(rect.x),
    height: Math.ceil(rect.y + rect.height) - Math.floor(rect.y),
  };
  const visible = decodeLegacyComparisonPng(
    await page.screenshot({ clip, animations: 'disabled' }),
    'Visible dark contour',
  );
  const hideContour = await page.addStyleTag({
    content: '[data-testid="primary-material"]::before { visibility: hidden !important; }',
  });
  let hidden: LegacyRgbaImage;
  try {
    hidden = decodeLegacyComparisonPng(
      await page.screenshot({ clip, animations: 'disabled' }),
      'Hidden dark contour',
    );
  } finally {
    await hideContour.evaluate((element) => element.remove());
  }
  expect(hidden.width).toBe(visible.width);
  expect(hidden.height).toBe(visible.height);
  const centerX = Math.floor(visible.width / 2);
  const centerY = Math.floor(visible.height / 2);
  const top = sampleContourDifference(visible, hidden, centerX - 8, 0, 16, 2);
  const bottom = sampleContourDifference(
    visible,
    hidden,
    centerX - 8,
    visible.height - 2,
    16,
    2,
  );
  const left = sampleContourDifference(visible, hidden, 0, centerY - 8, 2, 16);
  const right = sampleContourDifference(
    visible,
    hidden,
    visible.width - 2,
    centerY - 8,
    2,
    16,
  );

  // Horizontal samples must stay clear even when the dark side silhouette exists.
  const horizontalNoise = Math.max(top.absoluteDelta, bottom.absoluteDelta);
  expect(horizontalNoise).toBeLessThanOrEqual(1);
  expect(left.darkening).toBeGreaterThan(horizontalNoise + 1);
  expect(right.darkening).toBeGreaterThan(horizontalNoise + 1);
}

function sampleContourDifference(
  visible: LegacyRgbaImage,
  hidden: LegacyRgbaImage,
  x: number,
  y: number,
  width: number,
  height: number,
): { absoluteDelta: number; darkening: number } {
  let absoluteDelta = 0;
  let darkening = 0;
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const offset = (row * visible.width + column) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const difference = hidden.pixels[offset + channel]
          - visible.pixels[offset + channel];
        absoluteDelta += Math.abs(difference);
        darkening += difference;
      }
    }
  }
  const channels = width * height * 3;
  return {
    absoluteDelta: absoluteDelta / channels,
    darkening: darkening / channels,
  };
}
