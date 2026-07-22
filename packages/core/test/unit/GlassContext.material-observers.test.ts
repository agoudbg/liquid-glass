import { describe, expect, it, vi } from 'vitest';

import {
  GlassEngine,
  type GlassEngineRuntime,
} from '../../src/engine';
import type { MaterialPresentationState, RectLike } from '../../src/types';
import { callsNamed, FakeCanvas } from '../fixtures/fake-webgl2';

interface MutationObserverRecord {
  callback: MutationCallback;
  disconnected: boolean;
  observer: MutationObserver;
  options?: MutationObserverInit;
  target?: Node;
}

interface ResizeObserverRecord {
  callback: ResizeObserverCallback;
  disconnected: boolean;
  observed: Element[];
  observer: ResizeObserver;
}

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

class FakeElement {
  public readonly children: FakeCanvas[] = [];
  public readonly firstElementChild: Element | null = null;
  public readonly isConnected = true;
  public readonly offsetHeight: number;
  public readonly offsetWidth: number;
  public readonly scrollHeight: number;
  public readonly scrollWidth: number;
  public parentElement: HTMLElement | null = null;
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

  public contains(candidate: Node | null): boolean {
    let current = candidate as unknown as FakeElement | null;
    while (current) {
      if (current === this) return true;
      current = current.parentElement as unknown as FakeElement | null;
    }
    return false;
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

interface RuntimeHarness {
  readonly canvases: FakeCanvas[];
  readonly frames: Map<number, FrameRequestCallback>;
  readonly mutations: MutationObserverRecord[];
  readonly resizes: ResizeObserverRecord[];
  readonly runtime: GlassEngineRuntime;
  flushFrame(): void;
}

function createRuntimeHarness(
  onResizeObserve?: (target: Element) => void,
): RuntimeHarness {
  const canvases: FakeCanvas[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  const mutations: MutationObserverRecord[] = [];
  const resizes: ResizeObserverRecord[] = [];
  let frameId = 0;
  const runtime: GlassEngineRuntime = {
    cancelAnimationFrame: (handle) => {
      frames.delete(handle);
    },
    createCanvas: () => {
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
    createMutationObserver: (callback) => {
      const record = {
        callback,
        disconnected: false,
      } as unknown as MutationObserverRecord;
      const observer = {
        disconnect: () => {
          record.disconnected = true;
        },
        observe: (target: Node, options?: MutationObserverInit) => {
          record.target = target;
          record.options = options;
        },
        takeRecords: () => [],
      } as MutationObserver;
      record.observer = observer;
      mutations.push(record);
      return observer;
    },
    createResizeObserver: (callback) => {
      const record = {
        callback,
        disconnected: false,
        observed: [],
      } as unknown as ResizeObserverRecord;
      const observer = {
        disconnect: () => {
          record.disconnected = true;
        },
        observe: (target: Element) => {
          onResizeObserve?.(target);
          record.observed.push(target);
        },
        takeRecords: () => [],
        unobserve: vi.fn(),
      } as ResizeObserver;
      record.observer = observer;
      resizes.push(record);
      return observer;
    },
    devicePixelRatio: () => 1,
    getComputedStyle: () => ({
      borderBottomLeftRadius: '12px',
      borderBottomRightRadius: '12px',
      borderTopLeftRadius: '12px',
      borderTopRightRadius: '12px',
      display: 'block',
      opacity: '1',
      overflow: 'visible',
      overflowX: 'visible',
      overflowY: 'visible',
      transform: 'none',
      visibility: 'visible',
    }) as CSSStyleDeclaration,
    requestAnimationFrame: (callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    },
  };
  return {
    canvases,
    frames,
    mutations,
    resizes,
    runtime,
    flushFrame: () => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(16));
    },
  };
}

function childListMutation(target: FakeElement): MutationRecord {
  return { target: target as unknown as Node, type: 'childList' } as MutationRecord;
}

describe('GlassContext material observation', () => {
  it('coalesces observed changes into one material-only frame', () => {
    const harness = createRuntimeHarness();
    const container = new FakeElement({ x: 0, y: 0, width: 320, height: 180 });
    const material = new FakeElement({ x: 40, y: 30, width: 120, height: 56 });
    material.parentElement = container as unknown as HTMLElement;
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 0, y: 0, width: 320, height: 180 }));
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );
    const drawBackdrop = vi.fn();
    const backdropCaptured = vi.fn();
    context.on('backdropCaptured', backdropCaptured);
    context.addBackdropSource({
      draw: drawBackdrop,
      element: backdrop as unknown as HTMLCanvasElement,
      kind: 'canvas',
    });
    const handle = context.addMaterial({
      element: material as unknown as HTMLElement,
    });
    const presentations: MaterialPresentationState[] = [];
    handle.onPresentation((presentation) => presentations.push(presentation));
    const materialResize = harness.resizes.find((record) => (
      record.observed.includes(material as unknown as Element)
    ));
    const materialMutation = harness.mutations.find((record) => (
      record.target === container as unknown as Node
    ));
    if (!materialResize || !materialMutation) {
      throw new Error('Missing material observers.');
    }
    const gl = harness.canvases[0]?.gl;
    if (!gl) throw new Error('Missing presentation WebGL context.');
    const uploads = callsNamed(gl, 'texImage2D').length;
    const draws = callsNamed(gl, 'drawArrays').length;
    const sourceDraws = drawBackdrop.mock.calls.length;
    const captureEvents = backdropCaptured.mock.calls.length;

    materialResize.callback([], materialResize.observer);
    materialResize.callback([], materialResize.observer);
    materialMutation.callback(
      [childListMutation(material)],
      materialMutation.observer,
    );

    expect(harness.frames.size).toBe(1);
    harness.flushFrame();
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(draws + 1);
    expect(callsNamed(gl, 'texImage2D')).toHaveLength(uploads);
    expect(drawBackdrop).toHaveBeenCalledTimes(sourceDraws);
    expect(backdropCaptured).toHaveBeenCalledTimes(captureEvents);
    expect(presentations).toHaveLength(1);

    handle.destroy();
    expect(materialResize.disconnected).toBe(true);
    expect(materialMutation.disconnected).toBe(true);
    materialResize.callback([], materialResize.observer);
    materialMutation.callback(
      [childListMutation(container)],
      materialMutation.observer,
    );
    expect(harness.frames.size).toBe(0);
    context.destroy();
  });

  it('rolls back observer failures and keeps the context reusable', () => {
    const container = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    let failMaterialObservation = true;
    const harness = createRuntimeHarness((target) => {
      if (target !== container as unknown as Element && failMaterialObservation) {
        throw new Error('material observation failed');
      }
    });
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );
    const added = vi.fn();
    const removed = vi.fn();
    context.on('materialAdded', added);
    context.on('materialRemoved', removed);
    const failed = new FakeElement({ x: 20, y: 20, width: 100, height: 40 });
    failed.parentElement = container as unknown as HTMLElement;
    failed.setAttribute('is-fallback-mode', 'consumer');

    expect(() => context.addMaterial({
      element: failed as unknown as HTMLElement,
    })).toThrow('material observation failed');
    expect(failed.getAttribute('is-fallback-mode')).toBe('consumer');
    expect(added).not.toHaveBeenCalled();
    expect(removed).not.toHaveBeenCalled();
    expect(harness.frames.size).toBe(0);
    expect(harness.resizes[1]?.disconnected).toBe(true);
    expect(harness.mutations[0]?.disconnected).toBe(true);

    failMaterialObservation = false;
    const working = new FakeElement({ x: 30, y: 30, width: 120, height: 48 });
    working.parentElement = container as unknown as HTMLElement;
    const handle = context.addMaterial({
      element: working as unknown as HTMLElement,
    });
    expect(handle.destroyed).toBe(false);
    expect(added).toHaveBeenCalledOnce();
    handle.destroy();
    context.destroy();
  });

  it('completes context cleanup when material observer disconnect throws', () => {
    const harness = createRuntimeHarness();
    const container = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    const material = new FakeElement({ x: 20, y: 20, width: 100, height: 40 });
    material.parentElement = container as unknown as HTMLElement;
    material.setAttribute('is-fallback-mode', 'consumer');
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );
    const handle = context.addMaterial({
      element: material as unknown as HTMLElement,
    });
    const materialResize = harness.resizes.find((record) => (
      record.observed.includes(material as unknown as Element)
    ));
    const materialMutation = harness.mutations.find((record) => (
      record.target === container as unknown as Node
    ));
    if (!materialResize || !materialMutation) {
      throw new Error('Missing material observers.');
    }
    materialResize.observer.disconnect = () => {
      materialResize.disconnected = true;
      throw new Error('resize disconnect failed');
    };
    materialMutation.observer.disconnect = () => {
      materialMutation.disconnected = true;
      throw new Error('mutation disconnect failed');
    };
    handle.refreshLayout();
    expect(harness.frames.size).toBe(1);

    expect(() => context.destroy()).not.toThrow();
    expect(handle.destroyed).toBe(true);
    expect(material.getAttribute('is-fallback-mode')).toBe('consumer');
    expect(materialResize.disconnected).toBe(true);
    expect(materialMutation.disconnected).toBe(true);
    expect(harness.frames.size).toBe(0);
  });
});
