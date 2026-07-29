import { describe, expect, it, vi } from 'vitest';

import {
  GlassEngine,
  type GlassEngineRuntime,
} from '../../src/engine';
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
  public readonly children: FakeCanvas[] = [];
  public readonly computedStyle: Partial<CSSStyleDeclaration> = {};
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
    this.offsetWidth = rect.width;
    this.offsetHeight = rect.height;
    this.scrollWidth = rect.width;
    this.scrollHeight = rect.height;
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

function createRuntime(): GlassEngineRuntime & { canvases: FakeCanvas[] } {
  const canvases: FakeCanvas[] = [];
  return {
    canvases,
    createCanvas: () => {
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
    devicePixelRatio: () => 1,
    getComputedStyle: () => ({
      borderTopLeftRadius: '12px',
      borderTopRightRadius: '12px',
      borderBottomRightRadius: '12px',
      borderBottomLeftRadius: '12px',
      display: 'block',
      opacity: '1',
      transform: 'none',
      visibility: 'visible',
    } as CSSStyleDeclaration),
  };
}

describe('GlassContext fallback lifecycle', () => {
  it('forces CSS fallback without stopping custom-canvas updates', () => {
    const runtime = createRuntime();
    const container = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 0, y: 0, width: 240, height: 120 }));
    const material = new FakeElement({ x: 24, y: 20, width: 120, height: 56 });
    material.setAttribute('is-fallback-mode', 'consumer');
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const fallbackChanges = vi.fn();
    context.on('fallbackModeChanged', fallbackChanges);
    context.on('fullCanvasRendered', () => undefined);
    const draw = vi.fn();
    const source = context.addBackdropSource({
      kind: 'canvas',
      element: backdrop as unknown as HTMLCanvasElement,
      draw,
    });
    const materialHandle = context.addMaterial({
      element: material as unknown as HTMLElement,
    });
    const drawCalls = callsNamed(runtime.canvases[0].gl, 'drawArrays').length;
    const materialsCanvas = runtime.canvases[3];
    const fullCompositeCanvas = runtime.canvases[4];
    if (!materialsCanvas || !fullCompositeCanvas) {
      throw new Error('Missing aggregate output canvas.');
    }
    const materialCopies = materialsCanvas.context2d.calls.filter(
      ({ name }) => name === 'drawImage',
    ).length;

    context.setFallbackMode(true);
    expect(context.fallbackMode).toBe(true);
    expect(container.getAttribute('data-lg-fallback')).toBe('true');
    expect(material.getAttribute('is-fallback-mode')).toBe('true');
    expect(context.canvas.style.visibility).toBe('hidden');
    expect(materialsCanvas.context2d.calls.filter(
      ({ name }) => name === 'drawImage',
    )).toHaveLength(materialCopies);
    expect(materialsCanvas.context2d.calls.at(-1)).toEqual({
      name: 'clearRect',
      args: [0, 0, 240, 120],
    });
    expect(fullCompositeCanvas.context2d.calls.slice(-2)).toEqual([
      {
        name: 'drawImage',
        args: [
          runtime.canvases[1],
          0,
          0,
          240,
          120,
          0,
          0,
          240,
          120,
        ],
      },
      {
        name: 'drawImage',
        args: [
          materialsCanvas,
          0,
          0,
          240,
          120,
          0,
          0,
          240,
          120,
        ],
      },
    ]);
    source.refresh();
    expect(draw).toHaveBeenCalledTimes(2);
    expect(callsNamed(runtime.canvases[0].gl, 'drawArrays')).toHaveLength(drawCalls);

    context.setFallbackMode(false);
    expect(context.fallbackMode).toBe(false);
    expect(material.getAttribute('is-fallback-mode')).toBe('false');
    expect(context.canvas.style.visibility).toBe('visible');
    expect(fallbackChanges.mock.calls).toEqual([[true], [false]]);
    materialHandle.destroy();
    expect(material.getAttribute('is-fallback-mode')).toBe('consumer');
    source.destroy();
    context.destroy();
  });

  it('renders cached DOM content before revealing WebGL after fallback', async () => {
    const runtime = createRuntime();
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    runtime.requestAnimationFrame = (callback) => {
      const frameId = nextFrameId++;
      frames.set(frameId, callback);
      return frameId;
    };
    runtime.cancelAnimationFrame = (frameId) => frames.delete(frameId);
    runtime.captureDomElement = vi.fn(async () => ({
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      viewportRect: { x: 0, y: 0, width: 240, height: 120 },
    }));
    const flushFrame = (): void => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(16);
    };
    const container = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    const backdrop = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    const material = new FakeElement({ x: 24, y: 20, width: 120, height: 56 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    context.addBackdropSource({
      kind: 'dom',
      element: backdrop as unknown as HTMLElement,
    });
    context.addMaterial({ element: material as unknown as HTMLElement });
    flushFrame();
    await vi.waitFor(() => {
      expect(callsNamed(runtime.canvases[0].gl, 'drawArrays')).toHaveLength(1);
    });

    context.setFallbackMode(true);
    const renderVisibility: string[] = [];
    context.on('materialsRendered', () => {
      renderVisibility.push(context.canvas.style.visibility);
    });
    context.setFallbackMode(false);

    expect(renderVisibility).toEqual(['hidden']);
    expect(context.canvas.style.visibility).toBe('visible');
    context.destroy();
  });

  it('rejects disabling automatic fallback when no renderer exists', () => {
    const container = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    const runtime: GlassEngineRuntime = {
      createCanvas: () => new MissingWebGlCanvas() as unknown as HTMLCanvasElement,
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    };
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );

    expect(() => context.updateOptions({ enableFallback: false }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    expect(context.fallbackMode).toBe(true);
    expect(container.getAttribute('data-lg-fallback')).toBe('true');
    expect(context.canvas.style.visibility).toBe('hidden');
    context.destroy();
  });

  it('rolls back a material when a materialAdded listener throws', () => {
    const runtime = createRuntime();
    const container = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    const material = new FakeElement({ x: 24, y: 20, width: 120, height: 56 });
    material.setAttribute('is-fallback-mode', 'consumer');
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const failure = new Error('listener failed');
    context.on('materialAdded', () => {
      throw failure;
    });

    expect(() => context.addMaterial({
      element: material as unknown as HTMLElement,
    })).toThrow(failure);
    expect(material.getAttribute('is-fallback-mode')).toBe('consumer');
    context.destroy();
  });

  it('keeps fallback active and emits a typed error when restoration fails', () => {
    const runtime = createRuntime();
    const container = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const errors = vi.fn();
    context.on('error', errors);
    runtime.canvases[0].dispatch('webglcontextlost', {
      preventDefault: vi.fn(),
    } as unknown as Event);
    runtime.canvases[0].gl.shaderCompileSucceeds = false;

    runtime.canvases[0].dispatch('webglcontextrestored', {} as Event);

    expect(context.fallbackMode).toBe(true);
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SHADER_COMPILE_FAILED',
      phase: 'shader',
    }));
    runtime.canvases[0].gl.shaderCompileSucceeds = true;
    runtime.canvases[0].dispatch('webglcontextrestored', {} as Event);
    expect(context.fallbackMode).toBe(false);
    context.destroy();
  });

  it('handles WebGL context loss only on the internal renderer canvas', () => {
    const runtime = createRuntime();
    const container = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const publicPreventDefault = vi.fn();

    (context.canvas as unknown as FakeCanvas).dispatch('webglcontextlost', {
      preventDefault: publicPreventDefault,
    } as unknown as Event);

    expect(publicPreventDefault).not.toHaveBeenCalled();
    expect(context.fallbackMode).toBe(false);

    const internalPreventDefault = vi.fn();
    const presentationCanvas = context.canvas as unknown as FakeCanvas;
    const copiesBeforeFallbackChange: number[] = [];
    context.on('fallbackModeChanged', (enabled) => {
      if (!enabled) {
        copiesBeforeFallbackChange.push(
          presentationCanvas.context2d.calls.filter(
            ({ name }) => name === 'drawImage',
          ).length,
        );
      }
    });
    runtime.canvases[0].dispatch('webglcontextlost', {
      preventDefault: internalPreventDefault,
    } as unknown as Event);

    expect(internalPreventDefault).toHaveBeenCalledOnce();
    expect(context.fallbackMode).toBe(true);
    presentationCanvas.context2d.calls.splice(0);
    runtime.canvases[0].dispatch('webglcontextrestored', {} as Event);
    expect(context.fallbackMode).toBe(false);
    expect(copiesBeforeFallbackChange).toEqual([1]);
    expect(presentationCanvas.context2d.calls.filter(
      ({ name }) => name === 'drawImage',
    )).toHaveLength(2);
    context.destroy();
  });

  it('forwards diagnostic context actions to the internal renderer only', () => {
    const runtime = createRuntime();
    const container = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );

    expect(context.requestContextLoss()).toBe(true);
    expect(context.requestContextRestore()).toBe(true);
    expect(callsNamed(runtime.canvases[0]?.gl, 'loseContext')).toHaveLength(1);
    expect(callsNamed(runtime.canvases[0]?.gl, 'restoreContext')).toHaveLength(1);
    expect(callsNamed(
      (context.canvas as unknown as FakeCanvas).gl,
      'loseContext',
    )).toHaveLength(0);
    context.destroy();
  });
});
