import { describe, expect, it, vi } from 'vitest';

import {
  GlassEngine,
  type GlassEngineRuntime,
} from '../../src/engine';
import type {
  InteractionState,
  MaterialPresentationState,
  RectLike,
} from '../../src/types';
import { callsNamed, FakeCanvas } from '../fixtures/fake-webgl2';

interface IntersectionObserverRecord {
  callback: IntersectionObserverCallback;
  disconnected: boolean;
  observed: Element[];
  observer: IntersectionObserver;
  options: IntersectionObserverInit;
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
  readonly intersections: IntersectionObserverRecord[];
  readonly runtime: GlassEngineRuntime;
  flushFrame(): void;
}

function createRuntimeHarness(
  onIntersectionObserve?: (target: Element) => void,
): RuntimeHarness {
  const canvases: FakeCanvas[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  const intersections: IntersectionObserverRecord[] = [];
  let frameId = 0;
  let timestamp = 0;
  const runtime: GlassEngineRuntime = {
    cancelAnimationFrame: (handle) => {
      frames.delete(handle);
    },
    createCanvas: () => {
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
    createIntersectionObserver: (callback, options) => {
      const record = {
        callback,
        disconnected: false,
        observed: [],
        options,
      } as unknown as IntersectionObserverRecord;
      const observer = {
        disconnect: () => {
          record.disconnected = true;
        },
        observe: (target: Element) => {
          onIntersectionObserve?.(target);
          record.observed.push(target);
        },
        root: null,
        rootMargin: options.rootMargin ?? '0px',
        takeRecords: () => [],
        thresholds: [0],
        unobserve: vi.fn(),
      } as IntersectionObserver;
      record.observer = observer;
      intersections.push(record);
      return observer;
    },
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
    intersections,
    runtime,
    flushFrame: () => {
      timestamp += 16;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(timestamp));
    },
  };
}

function intersectionEntry(
  target: FakeElement,
  isIntersecting: boolean,
): IntersectionObserverEntry {
  return {
    intersectionRatio: isIntersecting ? 1 : 0,
    isIntersecting,
    rootBounds: null,
    target: target as unknown as Element,
    time: 0,
  } as IntersectionObserverEntry;
}

function pointerState(
  material: FakeElement,
  overrides: Partial<InteractionState['pointerState']>,
): InteractionState {
  return {
    elementRect: material.getBoundingClientRect(),
    pointerState: {
      clientX: 80,
      clientY: 50,
      isActive: false,
      isHovering: false,
      pointerId: 1,
      pointerType: 'mouse',
      ...overrides,
    },
  };
}

describe('GlassContext material intersection lifecycle', () => {
  it('pauses offscreen motion and resumes it without overriding synchronous culling', () => {
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
    const observer = harness.intersections[0];
    const gl = harness.canvases[0]?.gl;
    if (!observer || !gl) throw new Error('Missing material rendering resources.');
    const uploads = callsNamed(gl, 'texImage2D').length;
    const draws = callsNamed(gl, 'drawArrays').length;
    const sourceDraws = drawBackdrop.mock.calls.length;
    const captureEvents = backdropCaptured.mock.calls.length;

    handle.setInteractionState(pointerState(material, {
      clientX: 130,
      isActive: true,
      isHovering: true,
    }));
    expect(harness.frames.size).toBe(1);
    observer.callback([intersectionEntry(material, false)], observer.observer);
    observer.callback([intersectionEntry(material, true)], observer.observer);
    observer.callback([intersectionEntry(material, false)], observer.observer);
    expect(harness.frames.size).toBe(1);
    harness.flushFrame();

    // IO is only a scheduling hint: the synchronously visible material still draws.
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(draws + 1);
    expect(harness.frames.size).toBe(0);
    expect(callsNamed(gl, 'texImage2D')).toHaveLength(uploads);
    expect(drawBackdrop).toHaveBeenCalledTimes(sourceDraws);
    expect(backdropCaptured).toHaveBeenCalledTimes(captureEvents);
    expect(presentations).toHaveLength(1);

    handle.setInteractionState(pointerState(material, {
      clientX: 155,
      isActive: true,
      isHovering: true,
    }));
    expect(harness.frames.size).toBe(0);

    observer.callback([intersectionEntry(material, true)], observer.observer);
    observer.callback([intersectionEntry(material, true)], observer.observer);
    expect(harness.frames.size).toBe(1);
    harness.flushFrame();
    expect(harness.frames.size).toBe(1);
    harness.flushFrame();
    expect(presentations.length).toBeGreaterThan(1);
    expect(callsNamed(gl, 'texImage2D')).toHaveLength(uploads);
    expect(drawBackdrop).toHaveBeenCalledTimes(sourceDraws);

    handle.destroy();
    expect(observer.disconnected).toBe(true);
    expect(harness.frames.size).toBe(0);
    observer.callback([intersectionEntry(material, false)], observer.observer);
    expect(harness.frames.size).toBe(0);
    context.destroy();
  });

  it('rolls an IO observe failure back and keeps the context reusable', () => {
    const container = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    let failObservation = true;
    const harness = createRuntimeHarness(() => {
      if (failObservation) throw new Error('intersection observation failed');
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
    })).toThrow('intersection observation failed');
    expect(failed.getAttribute('is-fallback-mode')).toBe('consumer');
    expect(added).not.toHaveBeenCalled();
    expect(removed).not.toHaveBeenCalled();
    expect(harness.intersections[0]?.disconnected).toBe(true);

    failObservation = false;
    const working = new FakeElement({ x: 30, y: 30, width: 120, height: 48 });
    working.parentElement = container as unknown as HTMLElement;
    const handle = context.addMaterial({
      element: working as unknown as HTMLElement,
    });
    expect(handle.destroyed).toBe(false);
    expect(added).toHaveBeenCalledOnce();
    context.destroy();
    expect(handle.destroyed).toBe(true);
  });
});
