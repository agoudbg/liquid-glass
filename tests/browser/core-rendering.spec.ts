import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const fixtureUrl = `/@fs/${realpathSync(fileURLToPath(
  new URL('./support/core-rendering-fixture.ts', import.meta.url),
)).replace(/\\/gu, '/')}`;

test.beforeEach(async ({ page }) => {
  await page.goto('/?test=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('liquid-glass-playground-test-teardown'));
  });
});

test('keeps translated external materials aligned with their viewport bounds', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { createRenderingFixture, readOpaqueBounds } = await import(url) as
      typeof import('./support/core-rendering-fixture');
    const fixture = createRenderingFixture();
    try {
      fixture.context.createProxyInterface().registerExternalMaterial({
        clientRect: { x: 130, y: 80, width: 100, height: 80 },
        borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
        blur: 0,
        thickness: 10,
        refractIndex: 1.1,
        refractIntensity: 0,
        dispersion: 0,
        transform: { scaleX: 1, scaleY: 1, translateX: 30, translateY: 0 },
      });
      fixture.context.refresh();
      return readOpaqueBounds(fixture.context.canvas);
    } finally {
      fixture.destroy();
    }
  }, fixtureUrl);

  expect(result).toEqual({ left: 130, top: 80, width: 100, height: 80 });
});
