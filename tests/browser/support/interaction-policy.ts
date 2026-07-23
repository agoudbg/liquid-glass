import { expect, type Locator, type Page } from '@playwright/test';

import {
  maxScale,
  readTransform,
  translationDistance,
} from './interaction';
import { readElementRect } from './renderer';

/** Public adapters exercised by the interaction-policy fixture. */
export const POLICY_FRAMEWORKS = ['vue', 'react', 'solid'] as const;

/** One public adapter identifier accepted by the fixture URL. */
export type PolicyFramework = typeof POLICY_FRAMEWORKS[number];

/** Navigate to the gated fixture and wait for a healthy WebGL context. */
export async function openInteractionPolicyFixture(
  page: Page,
  framework: PolicyFramework,
): Promise<void> {
  await page.goto(
    `/?test=1&fixture=interaction-policy&framework=${framework}&scene=S004&glass=on`,
    { waitUntil: 'domcontentloaded' },
  );
  const shell = page.locator('#app');
  await expect(shell).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  await expect(shell).toHaveAttribute('data-framework', framework);
  await expect(shell).toHaveAttribute('data-scene', 'S004');
  await expect(shell).toHaveAttribute(
    'data-test-fixture',
    'interaction-policy',
  );
  await expect(shell).toHaveAttribute('data-gl-error', 'NO_ERROR');
  await expect(page.getByTestId('gl-status')).toHaveText('WebGL2 ready');
}

/** Store the last descendant pointer ID without changing event propagation. */
export async function installPointerCaptureProbe(
  material: Locator,
): Promise<void> {
  await material.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error('Expected an HTML material element.');
    }
    element.addEventListener('pointerdown', (event) => {
      element.dataset.captureProbePointerId = String(event.pointerId);
    });
  });
}

/** Assert that a descendant pointer remains uncaptured by the material. */
export async function expectNoPointerCapture(material: Locator): Promise<void> {
  await expect.poll(() => material.getAttribute('data-capture-probe-pointer-id'))
    .not.toBeNull();
  expect(await material.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error('Expected an HTML material element.');
    }
    const pointerId = Number(element.dataset.captureProbePointerId);
    return element.hasPointerCapture(pointerId);
  })).toBe(false);
}

/** Assert that an interaction policy leaves all transform output at rest. */
export async function expectMaterialIdle(material: Locator): Promise<void> {
  const transform = await readTransform(material);
  expect(Math.abs(transform.scaleX - 1)).toBeLessThan(0.004);
  expect(Math.abs(transform.scaleY - 1)).toBeLessThan(0.004);
  expect(translationDistance(transform)).toBeLessThan(0.3);
}

/** Wait for a held interaction to reach a visible scale. */
export async function expectMaterialScaleAbove(
  material: Locator,
  minimum: number,
): Promise<void> {
  await expect.poll(async () => maxScale(await readTransform(material)), {
    timeout: 8_000,
  }).toBeGreaterThan(minimum);
}

/** Wait for held slider velocity to stretch one scale axis more than the other. */
export async function expectMaterialAnisotropy(
  material: Locator,
  minimum = 0.01,
): Promise<void> {
  await expect.poll(async () => {
    const transform = await readTransform(material);
    return Math.abs(transform.scaleX - transform.scaleY);
  }, {
    timeout: 8_000,
  }).toBeGreaterThan(minimum);
}

/** Wait for a held button drag to move the glass surface. */
export async function expectMaterialTranslation(
  material: Locator,
): Promise<void> {
  await expect.poll(async () => translationDistance(
    await readTransform(material),
  ), {
    timeout: 8_000,
  }).toBeGreaterThan(0.5);
}

/** Return stable viewport points within one native descendant control. */
export async function controlGesturePoints(control: Locator): Promise<{
  center: { x: number; y: number };
  end: { x: number; y: number };
  start: { x: number; y: number };
}> {
  const rect = await readElementRect(control);
  return {
    center: {
      x: rect.x + rect.width * 0.5,
      y: rect.y + rect.height * 0.5,
    },
    start: {
      x: rect.x + rect.width * 0.25,
      y: rect.y + rect.height * 0.5,
    },
    end: {
      x: rect.x + rect.width * 0.75,
      y: rect.y + rect.height * 0.5,
    },
  };
}

/** Assert that framework reconciliation preserved every material element. */
export async function expectStableMaterialIdentities(
  materials: Locator,
): Promise<void> {
  expect(await materials.evaluateAll((elements) => {
    const probe = Reflect.get(window, '__interactionPolicyIdentityProbe');
    return Array.isArray(probe)
      && probe.length === elements.length
      && elements.every((element, index) => probe[index] === element);
  })).toBe(true);
}
