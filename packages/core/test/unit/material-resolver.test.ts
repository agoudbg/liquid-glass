import { describe, expect, it } from 'vitest';

import { resolveRendererMaterial } from '../../src/engine/material-resolver';
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
    borderTopLeftRadius: '0px',
    borderTopRightRadius: '0px',
    borderBottomRightRadius: '0px',
    borderBottomLeftRadius: '0px',
    display: 'block',
    opacity: '1',
    transform: 'none',
    visibility: 'visible',
    ...overrides,
  } as CSSStyleDeclaration;
}

class StyledElement {
  readonly offsetHeight: number;
  readonly offsetWidth: number;
  parentElement: HTMLElement | null = null;

  constructor(
    private readonly rect: RectLike,
    readonly style: CSSStyleDeclaration,
  ) {
    this.offsetWidth = rect.width;
    this.offsetHeight = rect.height;
  }

  getBoundingClientRect(): DOMRectReadOnly {
    return domRect(this.rect);
  }
}

function createRuntime(): GlassEngineRuntime {
  return {
    createCanvas: () => ({} as HTMLCanvasElement),
    devicePixelRatio: () => 1,
    getComputedStyle: (element) => (
      (element as unknown as StyledElement).style
    ),
  };
}

describe('resolveRendererMaterial', () => {
  it('uses legacy optical defaults and cumulative ancestor opacity', () => {
    const container = new StyledElement(
      { x: 10, y: 20, width: 300, height: 200 },
      computedStyle({ opacity: '0.1' }),
    );
    const ancestor = new StyledElement(
      { x: 10, y: 20, width: 300, height: 200 },
      computedStyle({ opacity: '0.5' }),
    );
    const element = new StyledElement(
      { x: 30, y: 50, width: 120, height: 60 },
      computedStyle({ opacity: '0.8' }),
    );
    ancestor.parentElement = container as unknown as HTMLElement;
    element.parentElement = ancestor as unknown as HTMLElement;

    const material = resolveRendererMaterial(
      'material-1',
      { element: element as unknown as HTMLElement },
      container as unknown as HTMLElement,
      container.getBoundingClientRect(),
      createRuntime(),
    );

    expect(material).toMatchObject({
      opacity: 0.4,
      thickness: 10,
      refractIndex: 1.1,
      refractIntensity: 0.5,
      blur: 0,
      dispersion: 0.01,
    });
  });

  it('skips a material hidden by an ancestor inside the context', () => {
    const container = new StyledElement(
      { x: 0, y: 0, width: 300, height: 200 },
      computedStyle(),
    );
    const ancestor = new StyledElement(
      { x: 0, y: 0, width: 300, height: 200 },
      computedStyle({ visibility: 'hidden' }),
    );
    const element = new StyledElement(
      { x: 20, y: 20, width: 100, height: 40 },
      computedStyle(),
    );
    ancestor.parentElement = container as unknown as HTMLElement;
    element.parentElement = ancestor as unknown as HTMLElement;

    expect(resolveRendererMaterial(
      'material-hidden',
      { element: element as unknown as HTMLElement },
      container as unknown as HTMLElement,
      container.getBoundingClientRect(),
      createRuntime(),
    )).toBeNull();
  });

  it('preserves renderer output for a partially intersecting material', () => {
    const container = new StyledElement(
      { x: 10, y: 20, width: 300, height: 200 },
      computedStyle(),
    );
    const element = new StyledElement(
      { x: -10, y: 10, width: 60, height: 40 },
      computedStyle({ opacity: '0.75' }),
    );
    element.parentElement = container as unknown as HTMLElement;

    expect(resolveRendererMaterial(
      'material-partial',
      {
        blur: 2,
        dispersion: 0.02,
        element: element as unknown as HTMLElement,
        refractIndex: 1.2,
        refractIntensity: 0,
        thickness: 12,
      },
      container as unknown as HTMLElement,
      container.getBoundingClientRect(),
      createRuntime(),
    )).toEqual({
      id: 'material-partial',
      rect: { x: -20, y: -10, width: 60, height: 40 },
      matrix: [1, 0, 0, 1, 0, 0],
      radii: [0, 0, 0, 0],
      opacity: 0.75,
      thickness: 12,
      refractIndex: 1.2,
      refractIntensity: 0,
      blur: 2,
      dispersion: 0.02,
    });
  });

  it('maps a scrolled material into full-content canvas coordinates', () => {
    const container = new StyledElement(
      { x: 42, y: 42, width: 1_356, height: 760 },
      computedStyle(),
    );
    const element = new StyledElement(
      { x: 863, y: 143, width: 350, height: 190 },
      computedStyle(),
    );
    element.parentElement = container as unknown as HTMLElement;

    expect(resolveRendererMaterial(
      'material-scrolled',
      { element: element as unknown as HTMLElement },
      container as unknown as HTMLElement,
      container.getBoundingClientRect(),
      createRuntime(),
      { x: 0, y: 360 },
    )?.rect).toEqual({
      x: 821,
      y: 461,
      width: 350,
      height: 190,
    });
  });
});
