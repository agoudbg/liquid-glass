import { describe, expect, it, vi } from 'vitest';

import {
  GlassEngine,
  type GlassEngineRuntime,
} from '../../src/engine';
import { GlassError } from '../../src/errors/GlassError';
import type { RectLike } from '../../src/types';
import { callsNamed, FakeCanvas } from '../fixtures/fake-webgl2';

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

class FakeElement {
  readonly children: FakeCanvas[] = [];
  readonly computedStyle: Partial<CSSStyleDeclaration>;
  readonly offsetHeight: number;
  readonly offsetWidth: number;
  parentElement: HTMLElement | null = null;

  constructor(
    private rect: RectLike,
    computedStyle: Partial<CSSStyleDeclaration> = {},
  ) {
    this.computedStyle = computedStyle;
    this.offsetWidth = rect.width;
    this.offsetHeight = rect.height;
  }

  getBoundingClientRect(): DOMRectReadOnly {
    return domRect(this.rect);
  }

  appendChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const fakeCanvas = canvas as unknown as FakeCanvas;
    fakeCanvas.parentNode = this;
    this.children.push(fakeCanvas);
    return canvas;
  }

  removeChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const index = this.children.indexOf(canvas as unknown as FakeCanvas);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
    (canvas as unknown as FakeCanvas).parentNode = null;
    return canvas;
  }
}

function createRuntime(
  devicePixelRatio = 1,
): GlassEngineRuntime & { canvases: FakeCanvas[] } {
  const canvases: FakeCanvas[] = [];
  return {
    canvases,
    createCanvas: () => {
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
    devicePixelRatio: () => devicePixelRatio,
    getComputedStyle: (element) => ({
      borderTopLeftRadius: '12px',
      borderTopRightRadius: '12px',
      borderBottomRightRadius: '12px',
      borderBottomLeftRadius: '12px',
      display: 'block',
      opacity: '1',
      transform: 'none',
      visibility: 'visible',
      ...((element as unknown as FakeElement).computedStyle ?? {}),
    } as CSSStyleDeclaration),
  };
}

describe('GlassEngine', () => {
  it('owns the uniform canvas and draws a custom backdrop through one material', () => {
    const runtime = createRuntime(2);
    const container = new FakeElement({ x: 10, y: 20, width: 320, height: 180 });
    const backdrop = new FakeElement({ x: 10, y: 20, width: 320, height: 180 });
    const material = new FakeElement({ x: 50, y: 60, width: 120, height: 48 });
    const engine = new GlassEngine(runtime);
    const context = engine.createContext(
      container as unknown as HTMLElement,
      { renderPrecision: 1, canvasZIndex: 12 },
    );

    expect(container.children).toHaveLength(1);
    expect(context.canvas).toBe(container.children[0]);
    expect(context.canvas.className).toContain('liquid-glass-canvas');
    expect(context.canvas.getAttribute('aria-hidden')).toBe('true');
    expect(context.canvas.style.pointerEvents).toBe('none');
    expect(context.canvas.style.zIndex).toBe('12');

    const draw = vi.fn((
      drawingContext:
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D,
    ) => {
      drawingContext.fillRect(0, 0, 320, 180);
    });
    const rendered = vi.fn();
    context.on('materialsRendered', rendered);
    const source = context.addBackdropSource({
      kind: 'canvas',
      element: backdrop as unknown as HTMLElement,
      draw,
    });
    const handle = context.addMaterial({
      element: material as unknown as HTMLElement,
      radius: 12,
      thickness: 0.3,
      refractIndex: 1.2,
      refractIntensity: 0.8,
      blur: 0.03,
      dispersion: 0.02,
    });

    expect(draw).toHaveBeenLastCalledWith(expect.anything(), 320, 180);
    expect(runtime.canvases[2]).toMatchObject({ width: 640, height: 360 });
    expect(runtime.canvases[2].context2d.calls).toContainEqual({
      name: 'setTransform',
      args: [2, 0, 0, 2, 0, 0],
    });
    expect(callsNamed(runtime.canvases[0].gl, 'drawArrays')).toHaveLength(1);
    expect(rendered).toHaveBeenCalledWith(expect.objectContaining({
      canvas: context.canvas,
    }));

    const clearCountBeforeRemoval = callsNamed(runtime.canvases[0].gl, 'clear').length;
    handle.destroy();
    handle.destroy();
    expect(callsNamed(runtime.canvases[0].gl, 'drawArrays')).toHaveLength(1);
    expect(callsNamed(runtime.canvases[0].gl, 'clear')).toHaveLength(
      clearCountBeforeRemoval + 1,
    );
    source.destroy();
    expect(callsNamed(runtime.canvases[0].gl, 'clear')).toHaveLength(
      clearCountBeforeRemoval + 2,
    );
    context.destroy();
    context.destroy();
    expect(container.children).toHaveLength(0);
    expect(callsNamed(runtime.canvases[0].gl, 'deleteProgram')).toHaveLength(1);
  });

  it('cascades engine destruction and rejects work on destroyed contexts', () => {
    const runtime = createRuntime();
    const firstContainer = new FakeElement({ x: 0, y: 0, width: 100, height: 50 });
    const secondContainer = new FakeElement({ x: 0, y: 0, width: 100, height: 50 });
    const engine = new GlassEngine(runtime);
    const first = engine.createContext(firstContainer as unknown as HTMLElement);
    engine.createContext(secondContainer as unknown as HTMLElement);

    expect(first.canvas.style.zIndex).toBe('9999');

    engine.destroy();
    engine.destroy();
    expect(engine.destroyed).toBe(true);
    expect(first.destroyed).toBe(true);
    expect(firstContainer.children).toHaveLength(0);
    expect(secondContainer.children).toHaveLength(0);
    expect(() => first.refresh()).toThrowError(GlassError);
  });
});
