import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  collectRuntimeErrors,
  expectRectClose,
  materialById,
  maxScale,
  moveMouseTo,
  readTransform,
  touchPoint,
  translationDistance,
  waitForAnimationFrames,
} from './support/interaction';
import {
  readCanvasMetrics,
  readElementRect,
} from './support/renderer';

const FRAMEWORKS = ['vue', 'react', 'solid'] as const;
const GPU_TEST_TIMEOUT = 120_000;
const MOTION_TIMEOUT = 8_000;

test.describe.configure({ mode: 'serial' });

const NORMAL_MATERIALS = [
  { id: 's004-button', preset: 'button' },
  { id: 's004-context', preset: 'context-menu' },
  { id: 's004-slider', preset: 'slider' },
  { id: 's004-custom', preset: 'button' },
] as const;

const ORACLE_MATERIALS = [
  {
    id: 's004-button',
    preset: 'button',
    rect: { x: 261, y: 365, width: 270, height: 170 },
  },
  {
    id: 's004-context',
    preset: 'context-menu',
    rect: { x: 585, y: 365, width: 270, height: 170 },
  },
  {
    id: 's004-slider',
    preset: 'slider',
    rect: { x: 909, y: 365, width: 270, height: 170 },
  },
] as const;

test('exercises built-in presets and custom overrides through each public adapter', async ({
  page,
}) => {
  test.setTimeout(GPU_TEST_TIMEOUT);
  const runtimeErrors = collectRuntimeErrors(page);

  for (const framework of FRAMEWORKS) {
    await openInteractionScene(page, framework);
    const shell = page.locator('#app');
    const materials = page.locator('.liquid-glass-material[data-material-id]');
    await expect(materials).toHaveCount(NORMAL_MATERIALS.length);

    for (const definition of NORMAL_MATERIALS) {
      const material = materialById(page, definition.id);
      await expect(material).toHaveCount(1);
      await expect(material).toHaveAttribute(
        'data-interaction-preset',
        definition.preset,
      );
    }

    await materials.evaluateAll((elements) => {
      Reflect.set(window, '__s004MaterialIdentityProbe', [...elements]);
    });

    const button = materialById(page, 's004-button');
    const buttonPoint = await moveMouseTo(page, button, 0.72, 0.36);
    await waitForAnimationFrames(page);
    await expect.poll(async () => maxScale(await readTransform(button)), {
      timeout: MOTION_TIMEOUT,
    }).toBeGreaterThan(1.008);
    await page.mouse.down();
    await waitForAnimationFrames(page);
    await expect.poll(async () => maxScale(await readTransform(button)), {
      timeout: MOTION_TIMEOUT,
    }).toBeGreaterThan(1.025);
    await page.mouse.up();
    await page.mouse.move(8, 8);

    const context = materialById(page, 's004-context');
    const contextPoint = await moveMouseTo(page, context);
    await waitForAnimationFrames(page);
    const contextHover = await readTransform(context);
    expect(Math.abs(contextHover.scaleX - 1)).toBeLessThan(0.005);
    expect(Math.abs(contextHover.scaleY - 1)).toBeLessThan(0.005);
    expect(
      Math.abs(contextHover.translateX) + Math.abs(contextHover.translateY),
    ).toBeLessThan(0.5);
    await page.mouse.down();
    await page.mouse.move(contextPoint.x + 72, contextPoint.y + 36, {
      steps: 4,
    });
    await waitForAnimationFrames(page);
    await expect.poll(async () => maxScale(await readTransform(context)), {
      timeout: MOTION_TIMEOUT,
    }).toBeGreaterThan(1.004);
    await expect.poll(async () => translationDistance(
      await readTransform(context),
    ), {
      timeout: MOTION_TIMEOUT,
    }).toBeGreaterThan(1);
    await page.mouse.up();
    await page.mouse.move(8, 8);

    const slider = materialById(page, 's004-slider');
    const sliderPoint = await moveMouseTo(page, slider);
    await page.mouse.down();
    await waitForAnimationFrames(page);
    await expect.poll(async () => maxScale(await readTransform(slider)), {
      timeout: MOTION_TIMEOUT,
    }).toBeGreaterThan(1.08);
    await page.mouse.move(sliderPoint.x + 72, sliderPoint.y, { steps: 4 });
    await page.mouse.up();
    await page.mouse.move(8, 8);

    const custom = materialById(page, 's004-custom');
    await moveMouseTo(page, custom);
    await waitForAnimationFrames(page);
    await expect.poll(async () => maxScale(await readTransform(custom)), {
      timeout: MOTION_TIMEOUT,
    }).toBeGreaterThan(1.025);
    await page.mouse.down();
    await waitForAnimationFrames(page);
    await expect.poll(async () => maxScale(await readTransform(custom)), {
      timeout: MOTION_TIMEOUT,
    }).toBeGreaterThan(1.07);
    await page.mouse.up();
    await page.mouse.move(buttonPoint.x, buttonPoint.y);
    await page.mouse.move(8, 8);

    expect(await materials.evaluateAll((elements) => {
      const probe = Reflect.get(window, '__s004MaterialIdentityProbe');
      return Array.isArray(probe)
        && probe.length === elements.length
        && elements.every((element, index) => probe[index] === element);
    })).toBe(true);

    await expect(shell).toHaveAttribute('data-gl-error', 'NO_ERROR');
    const canvasMetrics = await readCanvasMetrics(
      page.locator('.liquid-glass-canvas'),
    );
    expect(canvasMetrics.nonTransparentPixels).toBeGreaterThan(1_000);
  }

  expect(runtimeErrors).toEqual([]);
});

test('matches the legacy S004 oracle before and during button press', async ({
  page,
}) => {
  test.setTimeout(GPU_TEST_TIMEOUT);
  const runtimeErrors = collectRuntimeErrors(page);

  for (const framework of FRAMEWORKS) {
    await page.goto(
      `/?test=1&framework=${framework}&scene=S004&oracle=1`,
      { waitUntil: 'domcontentloaded' },
    );
    const shell = page.locator('#app');
    await expectSceneReady(page, shell, framework);
    await expect(shell).toHaveAttribute('data-oracle-mode', 'true');
    await expect(
      page.locator('.liquid-glass-material[data-oracle-material]'),
    ).toHaveCount(ORACLE_MATERIALS.length);

    expectRectClose(
      await readElementRect(page.locator('.liquid-glass-canvas')),
      { x: 43, y: 43, width: 1_354, height: 814 },
      0.75,
    );

    for (const definition of ORACLE_MATERIALS) {
      const material = materialById(page, definition.id);
      await expect(material).toHaveAttribute(
        'data-oracle-material',
        definition.id,
      );
      await expect(material).toHaveAttribute(
        'data-interaction-preset',
        definition.preset,
      );
      expectRectClose(
        await readElementRect(material),
        definition.rect,
        0.75,
      );
    }

    const button = materialById(page, 's004-button');
    const buttonRect = await readElementRect(button);
    await page.mouse.move(
      buttonRect.x + buttonRect.width * 0.72,
      buttonRect.y + buttonRect.height * 0.36,
    );
    await page.waitForTimeout(300);
    await page.mouse.down();
    try {
      await page.waitForTimeout(900);
      expectRectClose(
        await readElementRect(button),
        { x: 254.25, y: 360.75, width: 283.5, height: 178.5 },
        1.25,
      );
      expectRectClose(
        await readElementRect(materialById(page, 's004-context')),
        ORACLE_MATERIALS[1].rect,
        0.75,
      );
      expectRectClose(
        await readElementRect(materialById(page, 's004-slider')),
        ORACLE_MATERIALS[2].rect,
        0.75,
      );
    } finally {
      await page.mouse.up();
    }
    await page.mouse.move(8, 8);

    const canvasMetrics = await readCanvasMetrics(
      page.locator('.liquid-glass-canvas'),
    );
    expect(canvasMetrics.nonTransparentPixels).toBeGreaterThan(1_000);
  }

  expect(runtimeErrors).toEqual([]);
});

test.describe('emulated touch input', () => {
  test.use({ hasTouch: true });

  test('drives and releases captured gestures through each adapter', async ({
    page,
  }) => {
    test.setTimeout(GPU_TEST_TIMEOUT);
    const runtimeErrors = collectRuntimeErrors(page);

    for (const framework of FRAMEWORKS) {
      await openInteractionScene(page, framework);
      expect(await page.evaluate(() => navigator.maxTouchPoints))
        .toBeGreaterThan(0);

      const button = materialById(page, 's004-button');
      const rect = await readElementRect(button);
      const start = {
        x: rect.x + rect.width * 0.5,
        y: rect.y + rect.height * 0.5,
      };
      const cdp = await page.context().newCDPSession(page);
      let touchActive = false;
      try {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [touchPoint(start.x, start.y)],
        });
        touchActive = true;
        await waitForAnimationFrames(page);
        await expect.poll(async () => maxScale(await readTransform(button)), {
          timeout: MOTION_TIMEOUT,
        }).toBeGreaterThan(1.025);

        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [touchPoint(start.x + 72, start.y + 36)],
        });
        await expect.poll(async () => translationDistance(
          await readTransform(button),
        ), {
          timeout: MOTION_TIMEOUT,
        }).toBeGreaterThan(1);

        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
        touchActive = false;
        await expect.poll(async () => maxScale(await readTransform(button)), {
          timeout: MOTION_TIMEOUT,
        }).toBeLessThan(1.02);
      } finally {
        if (touchActive) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
          });
        }
        await cdp.detach();
      }
    }

    expect(runtimeErrors).toEqual([]);
  });
});

async function openInteractionScene(
  page: Page,
  framework: typeof FRAMEWORKS[number],
): Promise<void> {
  await page.goto(
    `/?test=1&framework=${framework}&scene=S004&glass=on`,
    { waitUntil: 'domcontentloaded' },
  );
  const shell = page.locator('#app');
  await expectSceneReady(page, shell, framework);
  await expect(shell).toHaveAttribute('data-scene', 'S004');
}

async function expectSceneReady(
  page: Page,
  shell: Locator,
  framework: typeof FRAMEWORKS[number],
): Promise<void> {
  await expect(shell).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  await expect(shell).toHaveAttribute('data-framework', framework);
  await expect(shell).toHaveAttribute('data-gl-error', 'NO_ERROR');
  expect(await shell.getAttribute('data-test-fixture')).toBeNull();
  await expect(page.getByTestId('gl-status')).toHaveText('WebGL2 ready');
}
