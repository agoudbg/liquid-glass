import {
  GlassEngine,
  type GlassEngineRuntime,
} from '../../src/engine';
import type {
  GlassContext,
  MaterialHandle,
  RectLike,
} from '../../src/types';
import {
  callsNamed,
  FakeCanvas,
  type FakeWebGL2Context,
} from './fake-webgl2';

function domRect(rect: RectLike): DOMRectReadOnly {
  return {
    ...rect,
    bottom: rect.y + rect.height,
    left: rect.x,
    right: rect.x + rect.width,
    top: rect.y,
    toJSON: () => ({ ...rect }),
  };
}

/** Minimal material element used by frame-batching integration tests. */
export class FakeMaterialElement {
  public readonly children: FakeCanvas[] = [];
  public readonly firstElementChild: Element | null = null;
  public readonly offsetHeight: number;
  public readonly offsetWidth: number;
  public readonly scrollHeight: number;
  public readonly scrollWidth: number;
  public parentElement: HTMLElement | null = null;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<EventListener>>();

  /** Create a stable element around one client rectangle. */
  public constructor(private readonly rect: RectLike) {
    this.offsetHeight = rect.height;
    this.offsetWidth = rect.width;
    this.scrollHeight = rect.height;
    this.scrollWidth = rect.width;
  }

  public get firstChild(): Node | null {
    return (this.children[0] ?? null) as unknown as Node | null;
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

  public insertBefore<T extends Node>(node: T, child: Node | null): T {
    const fakeCanvas = node as unknown as FakeCanvas;
    const index = child === null
      ? this.children.length
      : this.children.indexOf(child as unknown as FakeCanvas);
    fakeCanvas.parentNode = this;
    this.children.splice(index < 0 ? this.children.length : index, 0, fakeCanvas);
    return node;
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

/** RAF and WebGL state exposed to material batching tests. */
export interface MaterialFrameRuntimeHarness {
  canvases: FakeCanvas[];
  frames: Map<number, FrameRequestCallback>;
  runtime: GlassEngineRuntime;
  flushFrame(): void;
}

/** Context, container, and deterministic runtime used by batching tests. */
export interface MaterialContextHarness {
  container: FakeMaterialElement;
  context: GlassContext;
  harness: MaterialFrameRuntimeHarness;
}

function createRuntimeHarness(requestHook: () => void): MaterialFrameRuntimeHarness {
  const canvases: FakeCanvas[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  let timestamp = 0;
  const runtime: GlassEngineRuntime = {
    cancelAnimationFrame: (handle) => frames.delete(handle),
    createCanvas: () => {
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
    createIntersectionObserver: () => null,
    createMutationObserver: () => null,
    createResizeObserver: () => null,
    devicePixelRatio: () => 1,
    getComputedStyle: () => ({
      borderBottomLeftRadius: '12px',
      borderBottomRightRadius: '12px',
      borderTopLeftRadius: '12px',
      borderTopRightRadius: '12px',
      display: 'block',
      opacity: '1',
      transform: 'none',
      visibility: 'visible',
      zIndex: 'auto',
    }) as CSSStyleDeclaration,
    requestAnimationFrame: (callback) => {
      requestHook();
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
      timestamp += 16;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(timestamp));
    },
  };
}

/** Create one context with an uploaded canvas backdrop. */
export function mountMaterialContext(
  requestHook: () => void = () => undefined,
): MaterialContextHarness {
  const harness = createRuntimeHarness(requestHook);
  const container = new FakeMaterialElement({
    x: 0,
    y: 0,
    width: 360,
    height: 220,
  });
  const backdrop = new FakeCanvas();
  backdrop.setClientRect(domRect({ x: 0, y: 0, width: 360, height: 220 }));
  const context = new GlassEngine(harness.runtime).createContext(
    container as unknown as HTMLElement,
  );
  context.addBackdropSource({
    draw: (drawingContext) => drawingContext.fillRect(0, 0, 360, 220),
    element: backdrop as unknown as HTMLCanvasElement,
    kind: 'canvas',
  });
  return { container, context, harness };
}

/** Add one material to a mounted batching context. */
export function addHarnessMaterial(
  mounted: MaterialContextHarness,
  rect: RectLike,
  radius = 12,
): MaterialHandle {
  const material = new FakeMaterialElement(rect);
  material.parentElement = mounted.container as unknown as HTMLElement;
  return mounted.context.addMaterial({
    element: material as unknown as HTMLElement,
    radius,
  });
}

/** Read the most recent scalar value written to one fake shader uniform. */
export function latestUniformValue(
  gl: FakeWebGL2Context,
  uniformName: string,
): unknown {
  const calls = callsNamed(gl, 'uniform1f');
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const location = calls[index]?.args[0];
    if (
      typeof location === 'object'
      && location !== null
      && 'name' in location
      && location.name === uniformName
    ) {
      return calls[index]?.args[1];
    }
  }
  return undefined;
}
