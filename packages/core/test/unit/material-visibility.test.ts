import { describe, expect, it } from 'vitest';

import {
  resolveMaterialVisibility,
  type VisibleMaterialVisibility,
} from '../../src/engine/material-visibility';
import type { GlassEngineRuntime } from '../../src/engine/runtime';
import type { RectLike } from '../../src/types';

function domRect(rect: RectLike): DOMRectReadOnly {
  return {
    ...rect,
    top: rect.y,
    left: rect.x,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    toJSON: () => ({ ...rect }),
  };
}

function computedStyle(
  overrides: Partial<CSSStyleDeclaration> = {},
): CSSStyleDeclaration {
  return {
    display: 'block',
    opacity: '1',
    visibility: 'visible',
    ...overrides,
  } as CSSStyleDeclaration;
}

class StyledElement {
  getBoundingClientRectCalls = 0;
  parentElement: HTMLElement | null = null;

  constructor(
    private rect: RectLike,
    readonly style: CSSStyleDeclaration = computedStyle(),
    isConnected?: boolean,
  ) {
    if (isConnected !== undefined) {
      Object.defineProperty(this, 'isConnected', { value: isConnected });
    }
  }

  getBoundingClientRect(): DOMRectReadOnly {
    this.getBoundingClientRectCalls += 1;
    return domRect(this.rect);
  }

  setRect(rect: RectLike): void {
    this.rect = rect;
  }
}

function asElement(element: StyledElement): HTMLElement {
  return element as unknown as HTMLElement;
}

function createRuntime(reads: Map<StyledElement, number> = new Map()): GlassEngineRuntime {
  return {
    createCanvas: () => ({} as HTMLCanvasElement),
    devicePixelRatio: () => 1,
    getComputedStyle: (element) => {
      const styledElement = element as unknown as StyledElement;
      reads.set(styledElement, (reads.get(styledElement) ?? 0) + 1);
      return styledElement.style;
    },
  };
}

const CANVAS_RECT = domRect({ x: 10, y: 20, width: 100, height: 100 });

function createVisiblePair(): {
  container: StyledElement;
  element: StyledElement;
} {
  const container = new StyledElement(
    { x: 10, y: 20, width: 100, height: 100 },
  );
  const element = new StyledElement(
    { x: 20, y: 30, width: 40, height: 30 },
  );
  element.parentElement = asElement(container);
  return { container, element };
}

function resolve(
  element: StyledElement,
  container: StyledElement,
  runtime: GlassEngineRuntime = createRuntime(),
) {
  return resolveMaterialVisibility(
    asElement(element),
    asElement(container),
    CANVAS_RECT,
    runtime,
  );
}

function requireVisible(
  result: ReturnType<typeof resolveMaterialVisibility>,
): VisibleMaterialVisibility {
  expect(result.reason).toBe('visible');
  if (!result.visible) {
    throw new Error(`Expected a visible material, received ${result.reason}.`);
  }
  return result;
}

describe('resolveMaterialVisibility', () => {
  it('rejects a disconnected element before layout or style reads', () => {
    const { container } = createVisiblePair();
    const element = new StyledElement(
      { x: 20, y: 30, width: 40, height: 30 },
      computedStyle(),
      false,
    );
    const reads = new Map<StyledElement, number>();

    expect(resolve(element, container, createRuntime(reads))).toEqual({
      reason: 'disconnected',
      visible: false,
    });
    expect(element.getBoundingClientRectCalls).toBe(0);
    expect(reads.size).toBe(0);
  });

  it('treats a missing isConnected property as an unknown connected state', () => {
    const { container, element } = createVisiblePair();

    expect('isConnected' in element).toBe(false);
    expect(resolve(element, container).reason).toBe('visible');
  });

  it.each([
    ['non-finite left', { x: Number.NaN, y: 30, width: 40, height: 30 }],
    ['non-finite top', { x: 20, y: Number.POSITIVE_INFINITY, width: 40, height: 30 }],
    ['non-finite width', { x: 20, y: 30, width: Number.NaN, height: 30 }],
    ['non-finite height', { x: 20, y: 30, width: 40, height: Number.NEGATIVE_INFINITY }],
    ['zero width', { x: 20, y: 30, width: 0, height: 30 }],
    ['zero height', { x: 20, y: 30, width: 40, height: 0 }],
    ['negative width', { x: 20, y: 30, width: -1, height: 30 }],
    ['negative height', { x: 20, y: 30, width: 40, height: -1 }],
  ] satisfies Array<[string, RectLike]>)('rejects %s bounds before style reads', (_label, rect) => {
    const { container } = createVisiblePair();
    const element = new StyledElement(rect);
    const reads = new Map<StyledElement, number>();

    expect(resolve(element, container, createRuntime(reads))).toEqual({
      reason: 'empty',
      visible: false,
    });
    expect(reads.size).toBe(0);
  });

  it.each([
    ['material', { display: 'none' }],
    ['material', { visibility: 'hidden' }],
    ['material', { opacity: '0' }],
    ['ancestor', { display: 'none' }],
    ['ancestor', { visibility: 'hidden' }],
    ['ancestor', { opacity: '0' }],
  ] satisfies Array<[
    'material' | 'ancestor',
    Partial<CSSStyleDeclaration>,
  ]>)('rejects %s CSS hiding via %o', (scope, overrides) => {
    const { container } = createVisiblePair();
    const ancestor = new StyledElement(
      { x: 10, y: 20, width: 100, height: 100 },
      scope === 'ancestor' ? computedStyle(overrides) : computedStyle(),
    );
    const element = new StyledElement(
      { x: 20, y: 30, width: 40, height: 30 },
      scope === 'material' ? computedStyle(overrides) : computedStyle(),
    );
    ancestor.parentElement = asElement(container);
    element.parentElement = asElement(ancestor);

    expect(resolve(element, container)).toEqual({
      reason: 'hidden',
      visible: false,
    });
  });

  it('culls outside bounds before reading CSS visibility', () => {
    const { container } = createVisiblePair();
    const element = new StyledElement(
      { x: 140, y: 40, width: 20, height: 20 },
      computedStyle({ display: 'none' }),
    );
    const reads = new Map<StyledElement, number>();

    expect(resolve(element, container, createRuntime(reads)).reason).toBe('outside-canvas');
    expect(reads.size).toBe(0);
  });

  it('reuses the element style and preserves partial ancestor opacity', () => {
    const { container } = createVisiblePair();
    const ancestor = new StyledElement(
      { x: 10, y: 20, width: 100, height: 100 },
      computedStyle({ opacity: '0.5' }),
    );
    const element = new StyledElement(
      { x: 20, y: 30, width: 40, height: 30 },
      computedStyle({ opacity: '0.8' }),
    );
    ancestor.parentElement = asElement(container);
    element.parentElement = asElement(ancestor);
    const reads = new Map<StyledElement, number>();

    const result = requireVisible(resolve(element, container, createRuntime(reads)));

    expect(result.opacity).toBe(0.4);
    expect(result.style).toBe(element.style);
    expect(reads.get(element)).toBe(1);
    expect(reads.get(ancestor)).toBe(1);
  });

  it('excludes the container itself from CSS visibility and opacity', () => {
    const container = new StyledElement(
      { x: 10, y: 20, width: 100, height: 100 },
      computedStyle({ display: 'none', opacity: '0', visibility: 'hidden' }),
    );
    const element = new StyledElement(
      { x: 20, y: 30, width: 40, height: 30 },
      computedStyle({ opacity: '0.8' }),
    );
    element.parentElement = asElement(container);
    const reads = new Map<StyledElement, number>();

    expect(requireVisible(resolve(element, container, createRuntime(reads))).opacity).toBe(0.8);
    expect(reads.has(container)).toBe(false);
  });

  it.each([
    ['left', { x: -30, y: 40, width: 20, height: 20 }],
    ['right', { x: 120, y: 40, width: 20, height: 20 }],
    ['top', { x: 30, y: -10, width: 20, height: 20 }],
    ['bottom', { x: 30, y: 130, width: 20, height: 20 }],
  ] satisfies Array<[string, RectLike]>)('rejects bounds fully outside the %s side', (_side, rect) => {
    const { container } = createVisiblePair();
    const element = new StyledElement(rect);

    expect(resolve(element, container)).toEqual({
      reason: 'outside-canvas',
      visible: false,
    });
  });

  it.each([
    ['left', { x: 0, y: 40, width: 10, height: 20 }],
    ['right', { x: 110, y: 40, width: 10, height: 20 }],
    ['top', { x: 30, y: 10, width: 20, height: 10 }],
    ['bottom', { x: 30, y: 120, width: 20, height: 10 }],
  ] satisfies Array<[string, RectLike]>)('treats a %s edge touch as outside', (_side, rect) => {
    const { container } = createVisiblePair();
    const element = new StyledElement(rect);

    expect(resolve(element, container).reason).toBe('outside-canvas');
  });

  it('retains a material with any positive-area intersection', () => {
    const { container } = createVisiblePair();
    const element = new StyledElement(
      { x: 5, y: 15, width: 10, height: 10 },
    );

    expect(resolve(element, container).reason).toBe('visible');
  });

  it('re-evaluates mutable transformed bounds that move and scale into view', () => {
    const { container } = createVisiblePair();
    const element = new StyledElement(
      { x: 140, y: 40, width: 20, height: 20 },
    );

    expect(resolve(element, container).reason).toBe('outside-canvas');

    const transformedRect = { x: 95, y: 40, width: 30, height: 20 };
    element.setRect(transformedRect);
    const visible = requireVisible(resolve(element, container));

    expect(visible.rect).toMatchObject({
      left: transformedRect.x,
      top: transformedRect.y,
      width: transformedRect.width,
      height: transformedRect.height,
    });
  });
});
