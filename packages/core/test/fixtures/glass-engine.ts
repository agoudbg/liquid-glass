import type { GlassEngineRuntime } from '../../src/engine';
import type { RectLike } from '../../src/types';
import { FakeCanvas } from './fake-webgl2';

export function domRect(rect: RectLike): DOMRectReadOnly {
  return {
    ...rect,
    top: rect.y,
    left: rect.x,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    toJSON: () => ({ ...rect }),
  };
}

export function deferred<Value>(): {
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

export class FakeElement {
  public readonly children: FakeCanvas[] = [];
  public readonly computedStyle: Partial<CSSStyleDeclaration>;
  public readonly firstElementChild: Element | null = null;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<EventListener>>();
  public readonly offsetHeight: number;
  public readonly offsetWidth: number;
  public readonly scrollHeight: number;
  public readonly scrollWidth: number;
  public parentElement: HTMLElement | null = null;

  public constructor(
    private readonly rect: RectLike,
    computedStyle: Partial<CSSStyleDeclaration> = {},
  ) {
    this.computedStyle = computedStyle;
    this.offsetWidth = rect.width;
    this.offsetHeight = rect.height;
    this.scrollWidth = rect.width;
    this.scrollHeight = rect.height;
  }

  public getBoundingClientRect(): DOMRectReadOnly {
    return domRect(this.rect);
  }

  public addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  public removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  public removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  public querySelectorAll(): Element[] {
    return [];
  }

  public appendChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const fakeCanvas = canvas as unknown as FakeCanvas;
    fakeCanvas.parentNode = this;
    this.children.push(fakeCanvas);
    return canvas;
  }

  public removeChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const index = this.children.indexOf(canvas as unknown as FakeCanvas);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
    (canvas as unknown as FakeCanvas).parentNode = null;
    return canvas;
  }
}

export function createRuntime(
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
