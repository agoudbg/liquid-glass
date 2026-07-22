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
  private readonly attributes = new Map<string, string>();

  appendChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    this.children.push(canvas);
    return canvas;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  removeChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    this.children.splice(this.children.indexOf(canvas), 1);
    return canvas;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

describe('GlassContext lifecycle rollback', () => {
  it('restores core-owned presentation state when WebGL initialization fails', () => {
    const host = new HostElement();
    const runtime: GlassEngineRuntime = {
      createCanvas: () => new MissingWebGlCanvas() as unknown as HTMLCanvasElement,
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    };

    expect(() => new GlassEngine(runtime).createContext(
      host as unknown as HTMLElement,
      { scrollable: true },
    )).toThrowError(GlassError);
    expect(host.children).toHaveLength(0);
    expect(host.getAttribute('data-lg-scrollable')).toBeNull();
  });
});
