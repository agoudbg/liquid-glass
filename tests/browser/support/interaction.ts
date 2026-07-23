import { expect, type Locator, type Page } from '@playwright/test';

import { readElementRect } from './renderer';

interface InteractionTransform {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Locate one material through its stable scene-model identifier. */
export function materialById(page: Page, id: string): Locator {
  return page.locator(`.liquid-glass-material[data-material-id="${id}"]`);
}

/** Move a real mouse to one relative point and return its viewport coordinates. */
export async function moveMouseTo(
  page: Page,
  locator: Locator,
  ratioX = 0.5,
  ratioY = 0.5,
): Promise<{ x: number; y: number }> {
  const rect = await readElementRect(locator);
  const point = {
    x: rect.x + rect.width * ratioX,
    y: rect.y + rect.height * ratioY,
  };
  await locator.hover({
    position: {
      x: rect.width * ratioX,
      y: rect.height * ratioY,
    },
  });
  return point;
}

/** Wait until the page has advanced two animation frames. */
export async function waitForAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

/** Read the material transform variables applied by the interaction engine. */
export async function readTransform(
  locator: Locator,
): Promise<InteractionTransform> {
  return locator.evaluate((element) => {
    const styles = getComputedStyle(element);
    const read = (name: string): number => Number.parseFloat(
      styles.getPropertyValue(name),
    );
    return {
      scaleX: read('--lg-scale-x'),
      scaleY: read('--lg-scale-y'),
      translateX: read('--lg-translate-x'),
      translateY: read('--lg-translate-y'),
    };
  });
}

/** Return the larger animated scale axis. */
export function maxScale(transform: InteractionTransform): number {
  return Math.max(transform.scaleX, transform.scaleY);
}

/** Return the Euclidean distance of the animated translation. */
export function translationDistance(transform: InteractionTransform): number {
  return Math.hypot(transform.translateX, transform.translateY);
}

/** Build one Chrome DevTools Protocol touch point. */
export function touchPoint(x: number, y: number): {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotationAngle: number;
  force: number;
  id: number;
} {
  return {
    x,
    y,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 1,
    id: 1,
  };
}

/** Assert each rectangle dimension within an exclusive absolute tolerance. */
export function expectRectClose(
  actual: Rect,
  expected: Rect,
  tolerance: number,
): void {
  for (const dimension of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(actual[dimension] - expected[dimension]))
      .toBeLessThan(tolerance);
  }
}

/** Collect uncaught runtime and meaningful console errors from one page. */
export function collectRuntimeErrors(page: Page): string[] {
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
