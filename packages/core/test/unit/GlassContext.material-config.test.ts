import { describe, expect, it, vi } from 'vitest';

import {
  GlassEngine,
  type GlassEngineRuntime,
} from '../../src/engine';
import type {
  MaterialConfig,
  MaterialPresentationState,
  RectLike,
} from '../../src/types';
import { callsNamed, FakeCanvas } from '../fixtures/fake-webgl2';

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
  public readonly offsetHeight: number;
  public readonly offsetWidth: number;
  public readonly scrollHeight: number;
  public readonly scrollWidth: number;
  public parentElement: HTMLElement | null = null;
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
  readonly runtime: GlassEngineRuntime;
  flushFrame(): void;
}

function createRuntimeHarness(): RuntimeHarness {
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

function mount(config: Omit<MaterialConfig, 'element'> = {}) {
  const harness = createRuntimeHarness();
  const container = new FakeElement({ x: 0, y: 0, width: 320, height: 180 });
  const material = new FakeElement({ x: 40, y: 30, width: 160, height: 80 });
  material.parentElement = container as unknown as HTMLElement;
  const backdrop = new FakeCanvas();
  backdrop.setClientRect(domRect({ x: 0, y: 0, width: 320, height: 180 }));
  const context = new GlassEngine(harness.runtime).createContext(
    container as unknown as HTMLElement,
  );
  context.addBackdropSource({
    draw: (drawingContext) => drawingContext.fillRect(0, 0, 320, 180),
    element: backdrop as unknown as HTMLCanvasElement,
    kind: 'canvas',
  });
  const handle = context.addMaterial({
    ...config,
    element: material as unknown as HTMLElement,
  });
  return { context, handle, harness, material };
}

describe('GlassContext material config transactions', () => {
  it('isolates add input and materialAdded payload from internal state', () => {
    const spring = { stiffness: 180, damping: 18, mass: 1 };
    const harness = createRuntimeHarness();
    const container = new FakeElement({ x: 0, y: 0, width: 320, height: 180 });
    const material = new FakeElement({ x: 20, y: 20, width: 120, height: 60 });
    material.parentElement = container as unknown as HTMLElement;
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );
    context.on('materialAdded', (_id, added) => {
      added.radius = 99;
      if (added.interactionConfig?.activeSpring) {
        added.interactionConfig.activeSpring.stiffness = 2;
      }
    });
    const input: MaterialConfig = {
      element: material as unknown as HTMLElement,
      interactionConfig: { activeSpring: spring },
      radius: 12,
    };
    const handle = context.addMaterial(input);
    spring.stiffness = 1;
    input.radius = 88;
    const updated = vi.fn();
    context.on('materialUpdated', updated);
    const presentations: MaterialPresentationState[] = [];
    handle.onPresentation((presentation) => presentations.push(presentation));

    handle.update({ radius: 12 });
    expect(updated).not.toHaveBeenCalled();
    expect(harness.frames.size).toBe(0);
    handle.update({ blur: 1 });
    expect(updated).not.toHaveBeenCalled();
    expect(handle.getPresentation().interactionConfig.activeSpring.stiffness).toBe(180);
    expect(presentations).toHaveLength(1);
    expect(harness.frames.size).toBe(1);
    harness.flushFrame();
    expect(updated).toHaveBeenCalledOnce();
    context.destroy();
  });

  it('suppresses events, presentation, GL work, and RAF for true no-ops', () => {
    const { context, handle, harness } = mount({
      interactionConfig: {
        activeSpring: { stiffness: 180, damping: 18, mass: 1 },
      },
      radius: 12,
    });
    const updated = vi.fn();
    const presentations = vi.fn();
    context.on('materialUpdated', updated);
    handle.onPresentation(presentations);
    const gl = harness.canvases[0]?.gl;
    if (!gl) throw new Error('Missing presentation WebGL context.');
    const draws = callsNamed(gl, 'drawArrays').length;

    handle.update({});
    handle.update({ radius: 12 });
    handle.update({
      interactionConfig: {
        activeSpring: { mass: 1, damping: 18, stiffness: 180 },
      },
    });

    expect(updated).not.toHaveBeenCalled();
    expect(presentations).toHaveBeenCalledOnce();
    expect(harness.frames.size).toBe(0);
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(draws);
    context.destroy();
  });

  it('leaves state, events, GL work, and RAF untouched after precommit failure', () => {
    const { context, handle, harness } = mount({ radius: 12 });
    const updated = vi.fn();
    const presentations = vi.fn();
    context.on('materialUpdated', updated);
    handle.onPresentation(presentations);
    const gl = harness.canvases[0]?.gl;
    if (!gl) throw new Error('Missing presentation WebGL context.');
    const draws = callsNamed(gl, 'drawArrays').length;

    expect(() => handle.update({ radius: -1 })).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIG' }),
    );
    expect(() => handle.update({
      interactionConfig: {
        activeSpring: { stiffness: 180, damping: 18, mass: 0 },
      },
    })).toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    expect(updated).not.toHaveBeenCalled();
    expect(presentations).toHaveBeenCalledOnce();
    expect(harness.frames.size).toBe(0);
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(draws);

    handle.update({ radius: 12 });
    expect(updated).not.toHaveBeenCalled();
    expect(harness.frames.size).toBe(0);
    handle.update({ blur: 1 });
    expect(updated).not.toHaveBeenCalled();
    expect(harness.frames.size).toBe(1);
    context.destroy();
  });

  it('commits presentation failures, still emits updates, and schedules one render', () => {
    const { context, handle, harness } = mount();
    const presentationError = new Error('presentation failed');
    const eventError = new Error('event failed');
    let presentationCalls = 0;
    handle.onPresentation(() => {
      presentationCalls += 1;
      if (presentationCalls > 1) throw presentationError;
    });
    const updated = vi.fn(() => {
      throw eventError;
    });
    const unsubscribe = context.on('materialUpdated', updated);

    let caught: unknown;
    try {
      handle.update({ interactionPreset: 'slider' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(presentationError);
    expect(updated).not.toHaveBeenCalled();
    expect(handle.getPresentation().interactionConfig.preset).toBe('slider');
    expect(harness.frames.size).toBe(1);
    expect(() => harness.flushFrame()).toThrow(eventError);
    expect(updated).toHaveBeenCalledOnce();
    unsubscribe();

    expect(() => handle.update({ blur: 1 })).not.toThrow();
    expect(harness.frames.size).toBe(1);
    context.destroy();
  });

  it('retains a failing materialUpdated listener until consumer unsubscribe', () => {
    const { context, handle, harness } = mount({ radius: 12 });
    const eventError = new Error('materialUpdated failed');
    const listener = vi.fn(() => {
      throw eventError;
    });
    const unsubscribe = context.on('materialUpdated', listener);

    expect(() => handle.update({ radius: 13 })).not.toThrow();
    expect(harness.frames.size).toBe(1);
    expect(() => harness.flushFrame()).toThrow(eventError);
    expect(() => handle.update({ radius: 14 })).not.toThrow();
    expect(harness.frames.size).toBe(1);
    expect(() => harness.flushFrame()).toThrow(eventError);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    handle.update({ radius: 14 });
    expect(harness.frames.size).toBe(0);
    expect(() => handle.update({ radius: 15 })).not.toThrow();
    expect(harness.frames.size).toBe(1);
    context.destroy();
  });
});
