import { describe, expect, it, vi } from 'vitest';

import { GlassEngine, type GlassEngineRuntime } from '../../src/engine';
import { GlassError } from '../../src/errors/GlassError';
import { FakeCanvas } from '../fixtures/fake-webgl2';

class MissingWebGlCanvas extends FakeCanvas {
  override getContext(): null {
    return null;
  }
}

class HostElement {
  readonly children: HTMLCanvasElement[] = [];
  readonly parentElement: HTMLElement | null = null;
  scrollLeft = 0;
  scrollTop = 0;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<EventListener>>();

  appendChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    (canvas as unknown as FakeCanvas).parentNode = this;
    this.children.push(canvas);
    return canvas;
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

  removeChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    this.children.splice(this.children.indexOf(canvas), 1);
    (canvas as unknown as FakeCanvas).parentNode = null;
    return canvas;
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

describe('GlassContext lifecycle rollback', () => {
  it('uses CSS fallback when WebGL2 is unavailable and restores owned state', () => {
    const host = new HostElement();
    const runtime: GlassEngineRuntime = {
      createCanvas: () => new MissingWebGlCanvas() as unknown as HTMLCanvasElement,
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    };

    const context = new GlassEngine(runtime).createContext(
      host as unknown as HTMLElement,
      { scrollable: true },
    );

    expect(context.fallbackMode).toBe(true);
    expect(host.children).toHaveLength(1);
    expect(host.getAttribute('data-lg-fallback')).toBe('true');
    expect(context.canvas.style.visibility).toBe('hidden');
    context.destroy();
    expect(host.children).toHaveLength(0);
    expect(host.getAttribute('data-lg-fallback')).toBeNull();
    expect(host.getAttribute('data-lg-scrollable')).toBeNull();
  });

  it('rolls back presentation state when automatic fallback is disabled', () => {
    const host = new HostElement();
    const runtime: GlassEngineRuntime = {
      createCanvas: () => new MissingWebGlCanvas() as unknown as HTMLCanvasElement,
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    };

    expect(() => new GlassEngine(runtime).createContext(
      host as unknown as HTMLElement,
      { enableFallback: false, scrollable: true },
    )).toThrowError(GlassError);
    expect(host.children).toHaveLength(0);
    expect(host.getAttribute('data-lg-fallback')).toBeNull();
    expect(host.getAttribute('data-lg-scrollable')).toBeNull();
  });

  it('does not hide shader failures behind CSS fallback', () => {
    const host = new HostElement();
    let canvasIndex = 0;
    const runtime: GlassEngineRuntime = {
      createCanvas: () => {
        const canvas = new FakeCanvas();
        if (canvasIndex === 0) canvas.gl.shaderCompileSucceeds = false;
        canvasIndex += 1;
        return canvas as unknown as HTMLCanvasElement;
      },
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    };

    expect(() => new GlassEngine(runtime).createContext(
      host as unknown as HTMLElement,
    )).toThrowError(expect.objectContaining({ code: 'SHADER_COMPILE_FAILED' }));
    expect(host.children).toHaveLength(0);
    expect(host.getAttribute('data-lg-fallback')).toBeNull();
  });

  it('finishes context teardown before rethrowing a browser cleanup failure', () => {
    const host = new HostElement();
    const cleanupFailure = new Error('listener cleanup failed');
    const onDestroyed = vi.fn();
    const cleanupLifecycles: string[] = [];
    let readLifecycle = (): string => 'unavailable';
    const runtime: GlassEngineRuntime = {
      addEventListener: () => () => {
        cleanupLifecycles.push(readLifecycle());
        throw cleanupFailure;
      },
      createCanvas: () => new FakeCanvas() as unknown as HTMLCanvasElement,
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    };
    const context = new GlassEngine(runtime).createContext(
      host as unknown as HTMLElement,
      { debug: true },
    );
    readLifecycle = () => context.getDiagnostics().lifecycle;
    context.on('destroyed', onDestroyed);

    expect(() => context.destroy()).toThrow(cleanupFailure);
    expect(context.destroyed).toBe(true);
    expect(cleanupLifecycles).toEqual(['destroying']);
    expect(onDestroyed).toHaveBeenCalledOnce();
    expect(host.children).toHaveLength(0);
    expect(context.getDiagnostics()).toMatchObject({
      lifecycle: 'destroyed',
      resources: {
        activeCaptureTasks: 0,
        ownedCanvases: 0,
        trackedEventListeners: 0,
        webgl: {
          buffers: 0,
          programs: 0,
          textures: 0,
          vertexArrays: 0,
        },
      },
    });
    expect(() => context.destroy()).not.toThrow();
  });

  it('destroys every context before propagating the first context failure', () => {
    const hosts = [new HostElement(), new HostElement()];
    const cleanupFailure = new Error('context cleanup failed');
    const runtime: GlassEngineRuntime = {
      addEventListener: () => () => {
        throw cleanupFailure;
      },
      createCanvas: () => new FakeCanvas() as unknown as HTMLCanvasElement,
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    };
    const engine = new GlassEngine(runtime);
    const contexts = hosts.map((host) => engine.createContext(
      host as unknown as HTMLElement,
    ));

    expect(() => engine.destroy()).toThrow(cleanupFailure);
    expect(engine.destroyed).toBe(true);
    expect(contexts.every((context) => context.destroyed)).toBe(true);
    expect(hosts.every((host) => host.children.length === 0)).toBe(true);
    expect(() => engine.destroy()).not.toThrow();
  });
});
