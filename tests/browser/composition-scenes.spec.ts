import {
  expect,
  type Page,
  test,
} from '@playwright/test';

import { readCanvasMetrics } from './support/renderer';

const FRAMEWORKS = ['vue', 'react', 'solid'] as const;
const COMPOSITION_SCENES = ['S008', 'S009', 'S010', 'S011', 'S012'] as const;

test('renders every advanced Composition scene through every adapter', async ({
  page,
}) => {
  const runtimeErrors = collectRuntimeErrors(page);

  for (const framework of FRAMEWORKS) {
    for (const scene of COMPOSITION_SCENES) {
      await page.goto(
        `/?test=1&framework=${framework}&scene=${scene}`,
        { waitUntil: 'domcontentloaded' },
      );
      const shell = page.locator('#app');
      await expect(shell).toHaveAttribute('data-ready', 'true', {
        timeout: 15_000,
      });
      await expect(shell).toHaveAttribute('data-framework', framework);
      await expect(shell).toHaveAttribute('data-scene', scene);
      await expect(shell).toHaveAttribute('data-gl-error', 'NO_ERROR');
      await expect(page.getByTestId('composition-scene')).toBeVisible();
      await expect(page.locator('.liquid-glass-material')).toHaveCount(
        materialCount(scene),
      );

      const outerCanvas = page.locator(
        '.composition-context > .liquid-glass-content > .liquid-glass-canvas',
      );
      const metrics = await readCanvasMetrics(outerCanvas);
      expect(metrics.width).toBeGreaterThan(0);
      expect(metrics.height).toBeGreaterThan(0);
      if (scene !== 'S008') {
        expect(metrics.nonTransparentPixels).toBeGreaterThan(1_000);
      }
    }
  }

  expect(runtimeErrors).toEqual([]);
});

test('proves dedicated, nested, proxy, and theme presentation behavior', async ({
  page,
}) => {
  for (const framework of FRAMEWORKS) {
    const route = (scene: typeof COMPOSITION_SCENES[number]): string => (
      `/?test=1&framework=${framework}&scene=${scene}`
    );

    await page.goto(route('S008'), { waitUntil: 'domcontentloaded' });
    await waitForReady(page);
    await expect(page.locator('.liquid-glass-dedicated-canvas')).toHaveCount(2);
    for (const canvas of await page.locator(
      '.liquid-glass-dedicated-canvas',
    ).all()) {
      expect((await readCanvasMetrics(canvas)).nonTransparentPixels)
        .toBeGreaterThan(1_000);
    }

    await page.goto(route('S009'), { waitUntil: 'domcontentloaded' });
    await waitForReady(page);
    await expect(page.getByTestId('nested-child-context')).toBeVisible();
    await expect(page.locator('.liquid-glass-container')).toHaveCount(2);
    const nestedCanvas = page.locator(
      '.nested-child-context > .liquid-glass-content > .liquid-glass-canvas',
    );
    expect((await readCanvasMetrics(nestedCanvas)).nonTransparentPixels)
      .toBeGreaterThan(1_000);

    await page.goto(route('S010'), { waitUntil: 'domcontentloaded' });
    await waitForReady(page);
    await expect(page.getByTestId('proxy-source-context')).toBeVisible();
    const sourceCanvas = page.locator(
      '.proxy-source-context > .liquid-glass-content > .liquid-glass-canvas',
    );
    await expect.poll(async () => (
      await readCanvasMetrics(sourceCanvas)
    ).nonTransparentPixels).toBe(0);
    expect((await readCanvasMetrics(page.locator(
      '.composition-context > .liquid-glass-content > .liquid-glass-canvas',
    ))).nonTransparentPixels).toBeGreaterThan(1_000);

    await page.goto(route('S011'), { waitUntil: 'domcontentloaded' });
    await waitForReady(page);
    const expectedTints = [
      '#00000022',
      '#00000066',
      '#ffffff99',
      '#ffffff33',
    ];
    for (const [index, tint] of expectedTints.entries()) {
      await expect(page.locator(`.theme-material-${String(index + 1)}`))
        .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect.poll(() => page.locator(
        `.theme-material-${String(index + 1)}`,
      ).evaluate((element) => (
        getComputedStyle(element).getPropertyValue('--lg-background-tint').trim()
      ))).toBe(tint);
    }
  }
});

function materialCount(scene: typeof COMPOSITION_SCENES[number]): number {
  if (scene === 'S008' || scene === 'S009') return 2;
  if (scene === 'S011') return 4;
  return 1;
}

async function waitForReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', {
    timeout: 15_000,
  });
}

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
