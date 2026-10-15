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

for (const mode of ['uniform', 'dedicated'] as const) {
  for (const ancestor of [false, true]) {
    test(`aligns ${mode} materials under ${ancestor ? 'ancestor' : 'container'} scaling`, async ({ page }) => {
      const results = await page.evaluate(async ({ url, mode, ancestor }) => {
        const { createRenderingFixture, readOpaqueBounds } = await import(url) as
          typeof import('./support/core-rendering-fixture');
        const fixture = createRenderingFixture({ renderMode: mode });
        const wrapper = document.createElement('div');
        wrapper.style.transformOrigin = 'top left';
        if (ancestor) {
          document.body.append(wrapper);
          wrapper.append(fixture.root);
        }
        try {
          fixture.context.addMaterial({
            element: fixture.element,
            radius: 0,
            disableInteractions: true,
            refractIntensity: 0,
          });
          return [0.5, 2].map((scale) => {
            (ancestor ? wrapper : fixture.root).style.transform = `scale(${scale})`;
            fixture.context.refresh();
            const canvas = mode === 'dedicated'
              ? fixture.element.querySelector('canvas')!
              : fixture.context.canvas;
            const rect = fixture.element.getBoundingClientRect();
            return {
              actual: readOpaqueBounds(canvas),
              expected: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
              canvasWidth: fixture.context.canvas.width,
            };
          });
        } finally {
          fixture.destroy();
          wrapper.remove();
        }
      }, { url: fixtureUrl, mode, ancestor });

      for (const result of results) {
        expect(result.actual).toEqual(result.expected);
        expect(result.canvasWidth).toBe(400);
      }
    });
  }
}

test('samples a positioned backdrop in the same local space as a scaled material', async ({ page }) => {
  const pixel = await page.evaluate(async (url) => {
    const { createRenderingFixture } = await import(url) as
      typeof import('./support/core-rendering-fixture');
    const fixture = createRenderingFixture();
    try {
      fixture.root.style.transform = 'scale(0.5, 0.75)';
      fixture.backdrop.style.left = '40px';
      fixture.backdrop.style.width = '200px';
      fixture.context.addBackdropSource({
        kind: 'canvas',
        element: fixture.backdrop,
        mirrorToElement: false,
        draw: (drawing, width, height) => {
          drawing.fillStyle = '#ff0000';
          drawing.fillRect(0, 0, width / 2, height);
          drawing.fillStyle = '#00ff00';
          drawing.fillRect(width / 2, 0, width / 2, height);
        },
      });
      fixture.context.addMaterial({
        element: fixture.element,
        radius: 0,
        disableInteractions: true,
        refractIntensity: 0,
      });
      fixture.context.refresh();
      return [...fixture.context.canvas.getContext('2d')!.getImageData(150, 120, 1, 1).data];
    } finally {
      fixture.destroy();
    }
  }, fixtureUrl);

  expect(pixel).toEqual([0, 255, 0, 255]);
});
