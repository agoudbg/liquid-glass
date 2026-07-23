import { describe, expect, it, vi } from 'vitest';

import {
  GlassEngine,
  type GlassEngineRuntime,
} from '../../src/engine';
import type { CanvasLike, RectLike } from '../../src/types';
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
  public readonly children: FakeCanvas[] = [];
  public readonly firstElementChild: Element | null = null;
  public readonly offsetHeight: number;
  public readonly offsetWidth: number;
  public readonly parentElement: HTMLElement | null = null;
  public readonly scrollHeight: number;
  public readonly scrollWidth: number;
  public scrollLeft = 0;
  public scrollTop = 0;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<EventListener>>();

  public constructor(private readonly rect: RectLike) {
    this.offsetHeight = rect.height;
    this.offsetWidth = rect.width;
    this.scrollHeight = rect.height;
    this.scrollWidth = rect.width;
  }

  public addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  public appendChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const fakeCanvas = canvas as unknown as FakeCanvas;
    fakeCanvas.parentNode = this;
    this.children.push(fakeCanvas);
    return canvas;
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  public getBoundingClientRect(): DOMRectReadOnly {
    return domRect(this.rect);
  }

  public querySelectorAll(): Element[] {
    return [];
  }

  public removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  public removeChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const fakeCanvas = canvas as unknown as FakeCanvas;
    this.children.splice(this.children.indexOf(fakeCanvas), 1);
    fakeCanvas.parentNode = null;
    return canvas;
  }

  public removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class MissingWebGlCanvas extends FakeCanvas {
  public override getContext(): null {
    return null;
  }
}

class Missing2DCanvas extends FakeCanvas {
  public override getContext(
    contextId: string,
  ): ReturnType<FakeCanvas['getContext']> {
    return contextId === '2d' ? null : super.getContext(contextId);
  }
}

interface RuntimeHarness {
  readonly canvases: FakeCanvas[];
  readonly frames: Map<number, FrameRequestCallback>;
  readonly runtime: GlassEngineRuntime;
  flushFrame(): void;
}

function createRuntimeHarness(devicePixelRatio = 1): RuntimeHarness {
  const canvases: FakeCanvas[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const runtime: GlassEngineRuntime = {
    cancelAnimationFrame: (id) => {
      frames.delete(id);
    },
    createCanvas: () => {
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
    devicePixelRatio: () => devicePixelRatio,
    getComputedStyle: () => ({
      display: 'block',
      opacity: '1',
      transform: 'none',
      visibility: 'visible',
    } as CSSStyleDeclaration),
    getViewportRect: () => ({ x: 0, y: 0, width: 400, height: 240 }),
    requestAnimationFrame: (callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    },
  };
  return {
    canvases,
    frames,
    runtime,
    flushFrame: () => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(16));
    },
  };
}

describe('GlassContext render ownership', () => {
  it('copies cleared WebGL frames into the sole visible canvas before events', () => {
    const harness = createRuntimeHarness(1.5);
    const container = new FakeElement({ x: 10, y: 20, width: 201, height: 99 });
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );
    const rendererCanvas = harness.canvases[0];
    const compositeCanvas = harness.canvases[1];
    const presentationCanvas = harness.canvases[2];
    if (!rendererCanvas || !compositeCanvas || !presentationCanvas) {
      throw new Error('Missing context-owned canvas.');
    }

    expect(harness.canvases).toHaveLength(3);
    expect(context.canvas).toBe(presentationCanvas);
    expect(container.children).toEqual([presentationCanvas]);
    expect(rendererCanvas.parentNode).toBeNull();
    expect(compositeCanvas.parentNode).toBeNull();

    const eventCanvases: CanvasLike[] = [];
    const copyCountsAtEvent: number[] = [];
    context.on('materialsRendered', ({ canvas }) => {
      eventCanvases.push(canvas);
      copyCountsAtEvent.push(presentationCanvas.context2d.calls.length);
    });
    context.on('fullCanvasRendered', ({ canvas }) => {
      eventCanvases.push(canvas);
      copyCountsAtEvent.push(presentationCanvas.context2d.calls.length);
    });

    context.refresh();

    expect(rendererCanvas).toMatchObject({ width: 302, height: 149 });
    expect(presentationCanvas).toMatchObject({ width: 302, height: 149 });
    expect(callsNamed(rendererCanvas.gl, 'clear')).toHaveLength(1);
    expect(presentationCanvas.context2d.calls).toEqual([
      { name: 'clearRect', args: [0, 0, 302, 149] },
      {
        name: 'drawImage',
        args: [rendererCanvas, 0, 0, 302, 149],
      },
    ]);
    expect(eventCanvases).toEqual([context.canvas, context.canvas]);
    expect(copyCountsAtEvent).toEqual([2, 2]);

    context.destroy();
    context.destroy();

    expect(container.children).toHaveLength(0);
    expect(harness.canvases).toEqual([
      expect.objectContaining({ width: 0, height: 0 }),
      expect.objectContaining({ width: 0, height: 0 }),
      expect.objectContaining({ width: 0, height: 0 }),
    ]);
    expect(context.canvas).toMatchObject({ width: 0, height: 0 });
    expect(callsNamed(rendererCanvas.gl, 'deleteProgram')).toHaveLength(1);
    const preventDefault = vi.fn();
    rendererCanvas.dispatch('webglcontextlost', {
      preventDefault,
    } as unknown as Event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('emits composite and rendered events in pipeline order with physical dimensions', () => {
    const harness = createRuntimeHarness(1.5);
    const container = new FakeElement({ x: 10, y: 20, width: 201, height: 99 });
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 10, y: 20, width: 201, height: 99 }));
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );
    const rendererCanvas = harness.canvases[0];
    const presentationCanvas = harness.canvases[2];
    if (!rendererCanvas || !presentationCanvas) {
      throw new Error('Missing context-owned canvas.');
    }
    const eventOrder: string[] = [];
    const fullCanvasRendered = vi.fn();
    context.on('compositeRequested', () => eventOrder.push('compositeRequested'));
    context.on('backdropCaptured', () => eventOrder.push('backdropCaptured'));
    context.on('materialsRendered', ({ canvas }) => {
      expect(canvas).toBe(context.canvas);
      expect(presentationCanvas.context2d.calls).toHaveLength(2);
      eventOrder.push('materialsRendered');
    });
    context.on('fullCanvasRendered', (payload) => {
      expect(payload.canvas).toBe(context.canvas);
      expect(presentationCanvas.context2d.calls).toHaveLength(2);
      eventOrder.push('fullCanvasRendered');
      fullCanvasRendered(payload);
    });

    context.addBackdropSource({
      draw: () => undefined,
      element: backdrop as unknown as HTMLCanvasElement,
      kind: 'canvas',
    });

    expect(eventOrder).toEqual([
      'compositeRequested',
      'backdropCaptured',
      'materialsRendered',
      'fullCanvasRendered',
    ]);
    expect(fullCanvasRendered).toHaveBeenCalledWith({
      canvas: context.canvas,
      width: 302,
      height: 149,
    });
    expect(presentationCanvas.context2d.calls).toEqual([
      { name: 'clearRect', args: [0, 0, 302, 149] },
      {
        name: 'drawImage',
        args: [rendererCanvas, 0, 0, 302, 149],
      },
    ]);
    context.destroy();
  });

  it('emits and rethrows a missing presentation 2D context error', () => {
    const canvases: FakeCanvas[] = [];
    const runtime: GlassEngineRuntime = {
      createCanvas: () => {
        const canvas = canvases.length === 2
          ? new Missing2DCanvas()
          : new FakeCanvas();
        canvases.push(canvas);
        return canvas as unknown as HTMLCanvasElement;
      },
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    };
    const container = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const errors = vi.fn();
    context.on('error', errors);

    expect(() => context.refresh()).toThrowError(expect.objectContaining({
      code: 'RENDER_FAILED',
      phase: 'render',
    }));
    expect(errors).toHaveBeenCalledOnce();
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({
      code: 'RENDER_FAILED',
      message: 'Failed to acquire the liquid-glass presentation 2D context.',
      phase: 'render',
    }));
    context.destroy();
  });

  it('emits one render error from an active DOM capture frame', async () => {
    const harness = createRuntimeHarness();
    const capturedCanvas = new FakeCanvas();
    capturedCanvas.width = 320;
    capturedCanvas.height = 180;
    harness.runtime.captureDomElement = vi.fn(async () => ({
      canvas: capturedCanvas as unknown as HTMLCanvasElement,
      viewportRect: { x: 0, y: 0, width: 320, height: 180 },
    }));
    const container = new FakeElement({ x: 0, y: 0, width: 320, height: 180 });
    const backdrop = new FakeElement({ x: 0, y: 0, width: 320, height: 180 });
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );
    const errors = vi.fn();
    context.on('error', errors);
    context.addBackdropSource({
      element: backdrop as unknown as HTMLElement,
      kind: 'dom',
    });
    const rendererCanvas = harness.canvases[0];
    if (!rendererCanvas) throw new Error('Missing renderer canvas.');
    rendererCanvas.gl.errorCode = 0x0502;

    harness.flushFrame();

    await vi.waitFor(() => expect(errors).toHaveBeenCalledOnce());
    expect(errors).toHaveBeenCalledWith({
      code: 'RENDER_FAILED',
      phase: 'render',
      message: 'WebGL reported an error after rendering liquid-glass materials.',
      error: expect.objectContaining({ code: 'RENDER_FAILED' }),
      materialId: undefined,
      backdropId: undefined,
      details: { glError: 0x0502, drawCalls: 0 },
    });
    context.destroy();
  });

  it.each([
    ['forced fallback', false],
    ['missing renderer', true],
  ])('resizes the %s canvas when DPR changes', (_label, missingRenderer) => {
    let devicePixelRatio = 1;
    const container = new FakeElement({ x: 0, y: 0, width: 123, height: 45 });
    const runtime: GlassEngineRuntime = {
      createCanvas: () => (
        missingRenderer ? new MissingWebGlCanvas() : new FakeCanvas()
      ) as unknown as HTMLCanvasElement,
      devicePixelRatio: () => devicePixelRatio,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    };
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    if (!missingRenderer) context.setFallbackMode(true);
    context.refresh();
    expect(context.canvas).toMatchObject({ width: 123, height: 45 });

    devicePixelRatio = 2.25;
    context.refresh();

    expect(context.canvas).toMatchObject({ width: 277, height: 101 });
    context.destroy();
  });
});
