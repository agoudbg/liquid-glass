import { describe, expect, it } from 'vitest';

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
});
