import { describe, expect, it, vi } from 'vitest';

import type { DomCaptureResult } from '../../src/backdrop/dom-capture';
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

function deferred<Value>(): {
  promise: Promise<Value>;
  resolve(value: Value): void;
} {
  let resolvePromise: ((value: Value) => void) | undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}

class FakeElement {
  readonly children: FakeCanvas[] = [];
  readonly computedStyle: Partial<CSSStyleDeclaration>;
  readonly firstElementChild: Element | null = null;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<EventListener>>();
  readonly offsetHeight: number;
  readonly offsetWidth: number;
  readonly scrollHeight: number;
  readonly scrollWidth: number;
  parentElement: HTMLElement | null = null;

  constructor(
    private rect: RectLike,
    computedStyle: Partial<CSSStyleDeclaration> = {},
  ) {
    this.computedStyle = computedStyle;
    this.offsetWidth = rect.width;
    this.offsetHeight = rect.height;
    this.scrollWidth = rect.width;
    this.scrollHeight = rect.height;
  }

  getBoundingClientRect(): DOMRectReadOnly {
    return domRect(this.rect);
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  querySelectorAll(): Element[] {
    return [];
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
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 10, y: 20, width: 320, height: 180 }));
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
      element: backdrop as unknown as HTMLCanvasElement,
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
    expect(runtime.canvases[3]).toMatchObject({ width: 640, height: 360 });
    expect(runtime.canvases[3].context2d.calls).toContainEqual({
      name: 'setTransform',
      args: [2, 0, 0, 2, 0, 0],
    });
    expect(backdrop).toMatchObject({ width: 640, height: 360 });
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

  it('draws once into the owned canvas and mirrors that canvas to both consumers', () => {
    const runtime = createRuntime(2);
    const container = new FakeElement({ x: 10, y: 20, width: 200, height: 100 });
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 10, y: 20, width: 200, height: 100 }));
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const draw = vi.fn((
      drawingContext:
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D,
    ) => {
      drawingContext.fillRect(0, 0, 200, 100);
    });

    const source = context.addBackdropSource({
      kind: 'canvas',
      element: backdrop as unknown as HTMLCanvasElement,
      draw,
    });
    const ownedSource = runtime.canvases[3];

    expect(draw).toHaveBeenCalledOnce();
    expect(draw).toHaveBeenLastCalledWith(ownedSource.context2d, 200, 100);
    expect(backdrop.context2d.calls.filter((call) => call.name === 'fillRect'))
      .toHaveLength(0);
    expect(backdrop.context2d.calls.filter((call) => call.name === 'drawImage'))
      .toEqual([{ name: 'drawImage', args: [ownedSource, 0, 0] }]);
    expect(runtime.canvases[1].context2d.calls.filter((call) => call.name === 'drawImage'))
      .toEqual([{
        name: 'drawImage',
        args: [ownedSource, 0, 0, 400, 200],
      }]);

    source.refresh();
    expect(draw).toHaveBeenCalledTimes(2);
    expect(backdrop.context2d.calls.filter((call) => call.name === 'drawImage'))
      .toHaveLength(2);
    context.refresh('scroll');
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('captures a bounded DOM source without recapturing it for material updates', async () => {
    const runtime = createRuntime(2);
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    runtime.requestAnimationFrame = (callback) => {
      const frameId = nextFrameId++;
      frames.set(frameId, callback);
      return frameId;
    };
    runtime.cancelAnimationFrame = (frameId) => {
      frames.delete(frameId);
    };
    runtime.getViewportRect = () => ({ x: 0, y: 0, width: 320, height: 180 });

    const capturedCanvas = new FakeCanvas();
    capturedCanvas.width = 640;
    capturedCanvas.height = 400;
    const capture = vi.fn(async (request: Parameters<
      NonNullable<GlassEngineRuntime['captureDomElement']>
    >[0]) => ({
      canvas: capturedCanvas as unknown as HTMLCanvasElement,
      viewportRect: request.captureRect ?? {
        x: 0,
        y: 0,
        width: request.element.scrollWidth,
        height: request.element.scrollHeight,
      },
    }));
    runtime.captureDomElement = capture;

    const flushFrame = (): void => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) {
        callback(16);
      }
    };

    const container = new FakeElement({ x: 0, y: 0, width: 320, height: 180 });
    const backdrop = new FakeElement({ x: 0, y: 0, width: 320, height: 1_000 });
    const material = new FakeElement({ x: 40, y: 50, width: 120, height: 48 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const captured = vi.fn();
    context.on('backdropCaptured', captured);

    const source = context.addBackdropSource({
      kind: 'dom',
      element: backdrop as unknown as HTMLElement,
      captureLibrary: 'html2canvas',
      viewportCapture: { enabled: true, bufferY: 20 },
    });
    expect(capture).not.toHaveBeenCalled();

    flushFrame();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({
      backdropId: source.id,
      captureRect: { x: 0, y: 0, width: 320, height: 200 },
      library: 'html2canvas',
      pixelRatio: 2,
    }));
    await vi.waitFor(() => {
      expect(captured).toHaveBeenCalledWith(expect.objectContaining({
        id: source.id,
        canvas: capturedCanvas,
      }));
    });
    await vi.waitFor(() => {
      expect(runtime.canvases[1].context2d.calls.some(
        (call) => call.name === 'drawImage',
      )).toBe(true);
    });
    const compositeDraw = runtime.canvases[1].context2d.calls.find(
      (call) => call.name === 'drawImage',
    );
    expect(compositeDraw?.args[0]).toBe(capturedCanvas);
    expect(compositeDraw?.args.slice(1)).toEqual([0, 0, 640, 400]);

    context.addMaterial({ element: material as unknown as HTMLElement });
    flushFrame();
    await vi.waitFor(() => {
      expect(callsNamed(runtime.canvases[0].gl, 'drawArrays')).toHaveLength(1);
    });
    expect(capture).toHaveBeenCalledOnce();

    source.refresh();
    flushFrame();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    source.destroy();
    context.destroy();
  });

  it('rejects a stale DOM capture when source options change during rasterization', async () => {
    const runtime = createRuntime();
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    runtime.requestAnimationFrame = (callback) => {
      const frameId = nextFrameId++;
      frames.set(frameId, callback);
      return frameId;
    };
    runtime.cancelAnimationFrame = (frameId) => {
      frames.delete(frameId);
    };
    runtime.getViewportRect = () => ({ x: 0, y: 0, width: 200, height: 100 });
    const flushFrame = (): void => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) {
        callback(16);
      }
    };

    const oldCanvas = new FakeCanvas();
    const newCanvas = new FakeCanvas();
    const firstCapture = deferred<DomCaptureResult>();
    const capture = vi.fn<NonNullable<GlassEngineRuntime['captureDomElement']>>();
    capture
      .mockImplementationOnce(() => firstCapture.promise)
      .mockImplementationOnce(async (request) => ({
        canvas: newCanvas as unknown as HTMLCanvasElement,
        viewportRect: request.captureRect ?? { x: 0, y: 0, width: 200, height: 100 },
      }));
    runtime.captureDomElement = capture;

    const container = new FakeElement({ x: 0, y: 0, width: 200, height: 100 });
    const backdrop = new FakeElement({ x: 0, y: 0, width: 200, height: 100 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const source = context.addBackdropSource({
      kind: 'dom',
      element: backdrop as unknown as HTMLElement,
      backgroundColor: '#102030',
    });

    flushFrame();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
    source.update({ backgroundColor: '#405060' });
    expect(capture.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    expect(frames.size).toBe(1);
    flushFrame();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));

    firstCapture.resolve({
      canvas: oldCanvas as unknown as HTMLCanvasElement,
      viewportRect: { x: 0, y: 0, width: 200, height: 100 },
    });

    expect(capture.mock.calls[1]?.[0]).toMatchObject({
      backdropId: source.id,
      backgroundColor: '#405060',
    });
    await vi.waitFor(() => {
      const compositeDraws = runtime.canvases[1].context2d.calls.filter(
        (call) => call.name === 'drawImage',
      );
      expect(compositeDraws.at(-1)?.args[0]).toBe(newCanvas);
    });
    context.destroy();
  });

  it('replaces options in place while preserving context and registration handles', () => {
    const runtime = createRuntime(2);
    const container = new FakeElement({ x: 0, y: 0, width: 200, height: 100 });
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 0, y: 0, width: 200, height: 100 }));
    const material = new FakeElement({ x: 20, y: 20, width: 80, height: 40 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
      { renderPrecision: 1, canvasZIndex: 12 },
    );
    const contextIdentity = context;
    const draw = vi.fn();
    const source = context.addBackdropSource({
      kind: 'canvas',
      element: backdrop as unknown as HTMLCanvasElement,
      draw,
    });
    const materialHandle = context.addMaterial({
      element: material as unknown as HTMLElement,
    });
    const sourceId = source.id;
    const materialId = materialHandle.id;
    const drawCount = draw.mock.calls.length;

    context.updateOptions({ renderPrecision: 0.5, canvasZIndex: 24 });

    expect(context).toBe(contextIdentity);
    expect(source).toMatchObject({ id: sourceId, destroyed: false });
    expect(materialHandle).toMatchObject({ id: materialId, destroyed: false });
    expect(context.canvas.style.zIndex).toBe('24');
    expect(context.canvas).toMatchObject({ width: 200, height: 100 });
    expect(runtime.canvases[0]).toMatchObject({ width: 200, height: 100 });
    expect(runtime.canvases[1]).toMatchObject({ width: 200, height: 100 });
    expect(runtime.canvases[3]).toMatchObject({ width: 200, height: 100 });
    expect(backdrop).toMatchObject({ width: 200, height: 100 });
    expect(draw).toHaveBeenCalledTimes(drawCount + 1);
    expect(draw).toHaveBeenLastCalledWith(expect.anything(), 200, 100);

    context.updateOptions({});
    expect(context.canvas.style.zIndex).toBe('9999');
    expect(context.canvas).toMatchObject({ width: 400, height: 200 });
    expect(runtime.canvases[0]).toMatchObject({ width: 400, height: 200 });
    expect(runtime.canvases[3]).toMatchObject({ width: 400, height: 200 });
    expect(source).toMatchObject({ id: sourceId, destroyed: false });
    expect(materialHandle).toMatchObject({ id: materialId, destroyed: false });
  });

  it('rejects dedicated mode on creation and in-place option updates', () => {
    const runtime = createRuntime();
    const container = new FakeElement({ x: 0, y: 0, width: 100, height: 50 });
    const engine = new GlassEngine(runtime);

    expect(() => engine.createContext(
      container as unknown as HTMLElement,
      { renderMode: 'dedicated' },
    )).toThrowError(GlassError);

    const context = engine.createContext(
      container as unknown as HTMLElement,
      { canvasZIndex: 14 },
    );
    expect(() => context.updateOptions({
      renderMode: 'dedicated',
      canvasZIndex: 99,
      renderPrecision: 0.5,
    })).toThrowError(GlassError);
    expect(context.canvas.style.zIndex).toBe('14');
    expect(context.canvas).toMatchObject({ width: 1, height: 1 });
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
