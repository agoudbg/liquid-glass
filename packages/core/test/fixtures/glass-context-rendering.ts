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

export class FakeElement {
  public readonly children: FakeCanvas[] = [];
  public readonly clientHeight: number;
  public readonly clientWidth: number;
  public readonly firstElementChild: Element | null = null;
  public readonly offsetHeight: number;
  public readonly offsetWidth: number;
  public readonly parentElement: HTMLElement | null = null;
  public scrollLeft = 0;
  public scrollTop = 0;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<EventListener>>();
  private scrollSize: Pick<RectLike, 'height' | 'width'>;

  public constructor(
    private rect: RectLike,
    clientSize: Pick<RectLike, 'height' | 'width'> = rect,
    scrollSize: Pick<RectLike, 'height' | 'width'> = rect,
  ) {
    this.clientHeight = clientSize.height;
    this.clientWidth = clientSize.width;
    this.offsetHeight = rect.height;
    this.offsetWidth = rect.width;
    this.scrollSize = scrollSize;
  }

  public get scrollHeight(): number {
    return Math.max(
      this.scrollSize.height,
      this.resolveVisibleCanvasDimension('height'),
    );
  }

  public get scrollWidth(): number {
    return Math.max(
      this.scrollSize.width,
      this.resolveVisibleCanvasDimension('width'),
    );
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

  public setScrollSize(size: Pick<RectLike, 'height' | 'width'>): void {
    this.scrollSize = size;
  }

  public setClientRect(rect: RectLike): void {
    this.rect = rect;
  }

  private resolveVisibleCanvasDimension(
    dimension: 'height' | 'width',
  ): number {
    return this.children.reduce((largest, canvas) => {
      if (canvas.style.display === 'none') {
        return largest;
      }
      const value = Number.parseFloat(canvas.style[dimension] ?? '');
      return Number.isFinite(value) ? Math.max(largest, value) : largest;
    }, 0);
  }
}

export class FakeContextElement extends FakeElement {
  public constructor(
    rect: RectLike,
    clientSize: Pick<RectLike, 'height' | 'width'>,
    private readonly content: FakeElement,
  ) {
    super(rect, clientSize);
  }

  public querySelector<ElementType extends Element = Element>(
    selector: string,
  ): ElementType | null {
    return selector === ':scope > .liquid-glass-content'
      ? this.content as unknown as ElementType
      : null;
  }
}

export class MissingWebGlCanvas extends FakeCanvas {
  public override getContext(): null {
    return null;
  }
}

export class Missing2DCanvas extends FakeCanvas {
  public override getContext(
    contextId: string,
  ): ReturnType<FakeCanvas['getContext']> {
    return contextId === '2d' ? null : super.getContext(contextId);
  }
}

export interface RuntimeHarness {
  readonly canvases: FakeCanvas[];
  readonly frames: Map<number, FrameRequestCallback>;
  readonly runtime: GlassEngineRuntime;
  flushFrame(): void;
}

export function createRuntimeHarness(
  devicePixelRatio = 1,
  containerTransform = 'none',
): RuntimeHarness {
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
      borderBottomLeftRadius: '0px',
      borderBottomRightRadius: '0px',
      borderTopLeftRadius: '0px',
      borderTopRightRadius: '0px',
      display: 'block',
      opacity: '1',
      transform: containerTransform,
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
