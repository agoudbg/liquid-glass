import { type CDPSession, expect, test } from '@playwright/test';

import {
  collectRuntimeErrors,
  materialById,
  touchPoint,
  waitForAnimationFrames,
} from './support/interaction';
import {
  controlGesturePoints,
  expectMaterialAnisotropy,
  expectMaterialIdle,
  expectMaterialScaleAbove,
  expectMaterialTranslation,
  expectNoPointerCapture,
  expectStableMaterialIdentities,
  installPointerCaptureProbe,
  openInteractionPolicyFixture,
  POLICY_FRAMEWORKS,
} from './support/interaction-policy';
import { readCanvasMetrics } from './support/renderer';

const GPU_TEST_TIMEOUT = 120_000;

test.describe.configure({ mode: 'serial' });

test('preserves native mouse controls across disabled and click-only policies', async ({
  page,
}) => {
  test.setTimeout(GPU_TEST_TIMEOUT);
  const runtimeErrors = collectRuntimeErrors(page);

  for (const framework of POLICY_FRAMEWORKS) {
    await openInteractionPolicyFixture(page, framework);
    const materials = page.locator('.liquid-glass-material[data-material-id]');
    await expect(materials).toHaveCount(4);
    await materials.evaluateAll((elements) => {
      Reflect.set(window, '__interactionPolicyIdentityProbe', [...elements]);
    });

    const disabledButtonMaterial = materialById(page, 'disabled-button');
    const disabledButton = page.getByTestId('disabled-button-control');
    await expect(disabledButtonMaterial).toHaveAttribute(
      'disable-interactions',
      'true',
    );
    await installPointerCaptureProbe(disabledButtonMaterial);
    const disabledButtonPoints = await controlGesturePoints(disabledButton);
    await page.mouse.move(
      disabledButtonPoints.center.x,
      disabledButtonPoints.center.y,
    );
    await page.mouse.down();
    await expectNoPointerCapture(disabledButtonMaterial);
    await waitForAnimationFrames(page);
    await expectMaterialIdle(disabledButtonMaterial);
    await page.mouse.up();
    await expect(disabledButton).toHaveAttribute('data-click-count', '1');

    const disabledRangeMaterial = materialById(page, 'disabled-range');
    const disabledRange = page.getByTestId('disabled-range-control');
    await installPointerCaptureProbe(disabledRangeMaterial);
    const disabledRangeBefore = await disabledRange.inputValue();
    const disabledRangePoints = await controlGesturePoints(disabledRange);
    await page.mouse.move(disabledRangePoints.start.x, disabledRangePoints.start.y);
    await page.mouse.down();
    await expectNoPointerCapture(disabledRangeMaterial);
    await page.mouse.move(disabledRangePoints.end.x, disabledRangePoints.end.y, {
      steps: 6,
    });
    await waitForAnimationFrames(page);
    await expectMaterialIdle(disabledRangeMaterial);
    await page.mouse.up();
    await expect.poll(() => disabledRange.inputValue()).not.toBe(disabledRangeBefore);

    const clickButtonMaterial = materialById(page, 'click-only-button');
    const clickButton = page.getByTestId('click-only-button-control');
    await expect(clickButtonMaterial).toHaveAttribute(
      'only-click-interactions',
      'true',
    );
    await installPointerCaptureProbe(clickButtonMaterial);
    const clickButtonPoints = await controlGesturePoints(clickButton);
    await page.mouse.move(clickButtonPoints.center.x, clickButtonPoints.center.y);
    await page.waitForTimeout(250);
    await expectMaterialIdle(clickButtonMaterial);
    await page.mouse.move(clickButtonPoints.start.x, clickButtonPoints.start.y);
    await page.mouse.down();
    await expectNoPointerCapture(clickButtonMaterial);
    await expectMaterialScaleAbove(clickButtonMaterial, 1.015);
    await page.mouse.move(clickButtonPoints.end.x, clickButtonPoints.end.y, {
      steps: 6,
    });
    await expectMaterialTranslation(clickButtonMaterial);
    await page.mouse.up();
    await expect(clickButton).toHaveAttribute('data-click-count', '1');

    const clickRangeMaterial = materialById(page, 'click-only-range');
    const clickRange = page.getByTestId('click-only-range-control');
    await installPointerCaptureProbe(clickRangeMaterial);
    const clickRangePoints = await controlGesturePoints(clickRange);
    await page.mouse.move(clickRangePoints.center.x, clickRangePoints.center.y);
    await page.waitForTimeout(250);
    await expectMaterialIdle(clickRangeMaterial);
    await page.mouse.move(clickRangePoints.start.x, clickRangePoints.start.y);
    await page.mouse.down();
    await expectNoPointerCapture(clickRangeMaterial);
    await expectMaterialScaleAbove(clickRangeMaterial, 1.04);
    const clickRangeValueAtPress = await clickRange.inputValue();
    const heldRangePoints = await controlGesturePoints(clickRange);
    await page.mouse.move(heldRangePoints.end.x, heldRangePoints.end.y, {
      steps: 6,
    });
    await expect.poll(() => clickRange.inputValue())
      .not.toBe(clickRangeValueAtPress);
    await expectMaterialAnisotropy(clickRangeMaterial);
    await page.mouse.up();

    await expectStableMaterialIdentities(materials);
    await expect(page.locator('#app')).toHaveAttribute(
      'data-gl-error',
      'NO_ERROR',
    );
    const canvasMetrics = await readCanvasMetrics(
      page.locator('.liquid-glass-canvas'),
    );
    expect(canvasMetrics.nonTransparentPixels).toBeGreaterThan(1_000);
  }

  expect(runtimeErrors).toEqual([]);
});

test.describe('emulated touch input', () => {
  test.use({ hasTouch: true });

  test('preserves native touch controls and active held drags', async ({
    page,
  }) => {
    test.setTimeout(GPU_TEST_TIMEOUT);
    const runtimeErrors = collectRuntimeErrors(page);

    for (const framework of POLICY_FRAMEWORKS) {
      await openInteractionPolicyFixture(page, framework);
      expect(await page.evaluate(() => navigator.maxTouchPoints))
        .toBeGreaterThan(0);
      const materials = page.locator('.liquid-glass-material[data-material-id]');
      await materials.evaluateAll((elements) => {
        Reflect.set(window, '__interactionPolicyIdentityProbe', [...elements]);
      });
      const cdp = await page.context().newCDPSession(page);
      let touchActive = false;

      try {
        const disabledButtonMaterial = materialById(page, 'disabled-button');
        const disabledButton = page.getByTestId('disabled-button-control');
        await installPointerCaptureProbe(disabledButtonMaterial);
        const disabledButtonPoint = (
          await controlGesturePoints(disabledButton)
        ).center;
        await cdp.send('Input.dispatchTouchEvent', {
          touchPoints: [touchPoint(disabledButtonPoint.x, disabledButtonPoint.y)],
          type: 'touchStart',
        });
        touchActive = true;
        await expectNoPointerCapture(disabledButtonMaterial);
        await waitForAnimationFrames(page);
        await expectMaterialIdle(disabledButtonMaterial);
        await cdp.send('Input.dispatchTouchEvent', {
          touchPoints: [],
          type: 'touchEnd',
        });
        touchActive = false;
        await expect(disabledButton).toHaveAttribute('data-click-count', '1');

        const disabledRangeMaterial = materialById(page, 'disabled-range');
        const disabledRange = page.getByTestId('disabled-range-control');
        await installPointerCaptureProbe(disabledRangeMaterial);
        const disabledRangeBefore = await disabledRange.inputValue();
        const disabledRangePoints = await controlGesturePoints(disabledRange);
        await dispatchTouchDrag(
          cdp,
          disabledRangePoints.start,
          disabledRangePoints.end,
          async () => {
            touchActive = true;
            await expectNoPointerCapture(disabledRangeMaterial);
            await waitForAnimationFrames(page);
            await expectMaterialIdle(disabledRangeMaterial);
          },
          async () => {
            await waitForAnimationFrames(page);
            await expectMaterialIdle(disabledRangeMaterial);
          },
        );
        touchActive = false;
        await expect.poll(() => disabledRange.inputValue())
          .not.toBe(disabledRangeBefore);

        const clickButtonMaterial = materialById(page, 'click-only-button');
        const clickButton = page.getByTestId('click-only-button-control');
        await installPointerCaptureProbe(clickButtonMaterial);
        const clickButtonPoints = await controlGesturePoints(clickButton);
        await cdp.send('Input.dispatchTouchEvent', {
          touchPoints: [touchPoint(
            clickButtonPoints.start.x,
            clickButtonPoints.start.y,
          )],
          type: 'touchStart',
        });
        touchActive = true;
        await expectNoPointerCapture(clickButtonMaterial);
        await expectMaterialScaleAbove(clickButtonMaterial, 1.015);
        await cdp.send('Input.dispatchTouchEvent', {
          touchPoints: [touchPoint(
            clickButtonPoints.end.x,
            clickButtonPoints.end.y,
          )],
          type: 'touchMove',
        });
        await expectMaterialTranslation(clickButtonMaterial);
        await cdp.send('Input.dispatchTouchEvent', {
          touchPoints: [],
          type: 'touchEnd',
        });
        touchActive = false;
        await dispatchTouchTap(cdp, clickButtonPoints.center);
        await expect(clickButton).toHaveAttribute('data-click-count', '1');

        const clickRangeMaterial = materialById(page, 'click-only-range');
        const clickRange = page.getByTestId('click-only-range-control');
        await installPointerCaptureProbe(clickRangeMaterial);
        const clickRangeBefore = await clickRange.inputValue();
        const clickRangePoints = await controlGesturePoints(clickRange);
        await dispatchTouchDrag(
          cdp,
          clickRangePoints.start,
          clickRangePoints.end,
          async () => {
            touchActive = true;
            await expectNoPointerCapture(clickRangeMaterial);
            await expectMaterialScaleAbove(clickRangeMaterial, 1.04);
          },
          () => expectMaterialAnisotropy(clickRangeMaterial),
        );
        touchActive = false;
        await expect.poll(() => clickRange.inputValue())
          .not.toBe(clickRangeBefore);
      } finally {
        if (touchActive) {
          await cdp.send('Input.dispatchTouchEvent', {
            touchPoints: [],
            type: 'touchEnd',
          });
        }
        await cdp.detach();
      }

      await expectStableMaterialIdentities(materials);
      await expect(page.locator('#app')).toHaveAttribute(
        'data-gl-error',
        'NO_ERROR',
      );
    }

    expect(runtimeErrors).toEqual([]);
  });
});

async function dispatchTouchDrag(
  cdp: CDPSession,
  start: { x: number; y: number },
  end: { x: number; y: number },
  onPress: () => Promise<void>,
  onMove?: () => Promise<void>,
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [touchPoint(start.x, start.y)],
    type: 'touchStart',
  });
  await onPress();
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [touchPoint(end.x, end.y)],
    type: 'touchMove',
  });
  await onMove?.();
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [],
    type: 'touchEnd',
  });
}

async function dispatchTouchTap(
  cdp: CDPSession,
  point: { x: number; y: number },
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [touchPoint(point.x, point.y)],
    type: 'touchStart',
  });
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [],
    type: 'touchEnd',
  });
}
