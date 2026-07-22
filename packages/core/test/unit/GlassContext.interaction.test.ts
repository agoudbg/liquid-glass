import { afterEach, describe, expect, it, vi } from 'vitest';

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
  readonly children: FakeCanvas[] = [];
  readonly firstElementChild: Element | null = null;
  readonly offsetHeight: number;
  readonly offsetWidth: number;
  readonly scrollHeight: number;
  readonly scrollWidth: number;
  parentElement: HTMLElement | null = null;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<EventListener>>();

  constructor(private readonly rect: RectLike) {
    this.offsetWidth = rect.width;
    this.offsetHeight = rect.height;
    this.scrollWidth = rect.width;
    this.scrollHeight = rect.height;
  }

  getBoundingClientRect(): DOMRectReadOnly {
    return domRect(this.rect);
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  querySelectorAll(): Element[] {
    return [];
  }

  appendChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const fakeCanvas = canvas as unknown as FakeCanvas;
    fakeCanvas.parentNode = this;
    this.children.push(fakeCanvas);
    return canvas;
  }

  removeChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const fakeCanvas = canvas as unknown as FakeCanvas;
    this.children.splice(this.children.indexOf(fakeCanvas), 1);
    fakeCanvas.parentNode = null;
    return canvas;
  }
}

interface RuntimeHarness {
  readonly canvases: FakeCanvas[];
  readonly frames: Map<number, FrameRequestCallback>;
  readonly runtime: GlassEngineRuntime;
  flushFrame(): void;
  flushUntilIdle(maxFrames?: number): void;
}

function createRuntimeHarness(withAnimationFrame = true): RuntimeHarness {
  const canvases: FakeCanvas[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  let timestamp = 0;
  const runtime: GlassEngineRuntime = {
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
  if (withAnimationFrame) {
    runtime.cancelAnimationFrame = (id) => {
      frames.delete(id);
    };
    runtime.requestAnimationFrame = (callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    };
  }

  const harness: RuntimeHarness = {
    canvases,
    frames,
    runtime,
    flushFrame: () => {
      timestamp += 16;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(timestamp));
    },
    flushUntilIdle: (maxFrames = 300) => {
      let count = 0;
      while (frames.size > 0 && count < maxFrames) {
        harness.flushFrame();
        count += 1;
      }
      expect(count).toBeLessThan(maxFrames);
      expect(frames.size).toBe(0);
    },
  };
  return harness;
}

function pointerState(
  element: FakeElement,
  overrides: Partial<InteractionState['pointerState']>,
): InteractionState {
  return {
    elementRect: element.getBoundingClientRect(),
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

function mountMaterialHarness(
  interactionPreset: 'button' | 'slider' = 'button',
  withAnimationFrame = true,
) {
  const harness = createRuntimeHarness(withAnimationFrame);
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
    element: material as unknown as HTMLElement,
    interactionPreset,
  });
  return { backdrop, container, context, handle, harness, material };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GlassContext material interaction lifecycle', () => {
  it('publishes interaction frames without re-uploading the cached backdrop', () => {
    const { context, handle, harness, material } = mountMaterialHarness();
    const gl = harness.canvases[0]?.gl;
    if (!gl) throw new Error('Missing presentation WebGL context.');
    const presentations: MaterialPresentationState[] = [];
    const unsubscribe = handle.onPresentation((presentation) => {
      presentations.push(presentation);
    });
    expect(presentations).toHaveLength(1);
    expect(handle.getPresentation()).toMatchObject({
      blurred: false,
      fallbackMode: false,
      interactionConfig: { preset: 'button', showHighlight: true },
      interactionOutput: { scaleX: 1, scaleY: 1 },
      themeColorMode: 'light',
    });

    const uploads = callsNamed(gl, 'texImage2D').length;
    const mipmaps = callsNamed(gl, 'generateMipmap').length;
    const draws = callsNamed(gl, 'drawArrays').length;
    handle.setInteractionState(pointerState(material, {
      clientX: 120,
      clientY: 60,
      isActive: true,
      isHovering: true,
    }));
    harness.flushFrame();
    harness.flushFrame();

    expect(handle.getPresentation().interactionOutput).toMatchObject({
      highlightVisible: true,
      isActive: true,
    });
    expect(handle.getPresentation().interactionOutput.scaleX).toBeGreaterThan(1);
    expect(presentations.length).toBeGreaterThan(1);
    expect(callsNamed(gl, 'drawArrays').length).toBeGreaterThan(draws);
    expect(callsNamed(gl, 'texImage2D')).toHaveLength(uploads);
    expect(callsNamed(gl, 'generateMipmap')).toHaveLength(mipmaps);

    unsubscribe();
    context.destroy();
  });

  it('retries a failed full backdrop upload during the next material frame', () => {
    const { context, handle, harness } = mountMaterialHarness();
    const gl = harness.canvases[0]?.gl;
    if (!gl) throw new Error('Missing presentation WebGL context.');
    const uploads = vi.spyOn(gl, 'texImage2D');
    uploads.mockImplementationOnce(() => {
      throw new Error('upload failed');
    });

    expect(() => context.refresh('external'))
      .toThrow('Failed to upload the liquid-glass backdrop texture.');
    expect(uploads).toHaveBeenCalledTimes(1);
    handle.refreshLayout();
    harness.flushFrame();

    expect(uploads).toHaveBeenCalledTimes(2);
    context.destroy();
  });

  it('rebuilds presets without stale fields and returns isolated snapshots', () => {
    const { context, handle } = mountMaterialHarness('slider');
    expect(handle.getPresentation().interactionConfig).toMatchObject({
      activeBackgroundColor: 'transparent',
      enableBackgroundTransition: true,
      ignorePointerPosition: true,
      preset: 'slider',
      velocityStretch: true,
    });

    handle.update({ interactionPreset: 'button', interactionConfig: undefined });
    const button = handle.getPresentation();
    expect(button.interactionConfig).toMatchObject({
      preset: 'button',
      showHighlight: true,
    });
    expect(button.interactionConfig.velocityStretch).toBeUndefined();
    expect(button.interactionConfig.ignorePointerPosition).toBeUndefined();
    expect(button.interactionConfig.activeBackgroundColor).toBeUndefined();
    expect(button.interactionConfig.enableBackgroundTransition).toBeUndefined();

    button.interactionConfig.activeSpring.stiffness = 1;
    button.interactionOutput.scaleX = 99;
    expect(handle.getPresentation()).toMatchObject({
      interactionConfig: { activeSpring: { stiffness: 180 } },
      interactionOutput: { scaleX: 1 },
    });
    context.destroy();
  });

  it('sleeps after hover settles, wakes for idle return, and cancels on destroy', () => {
    vi.useFakeTimers();
    const { context, handle, harness, material } = mountMaterialHarness();
    handle.setInteractionState(pointerState(material, {
      clientX: 70,
      clientY: 50,
      isHovering: true,
    }));
    handle.setInteractionState(pointerState(material, {
      clientX: 150,
      clientY: 80,
      isHovering: true,
    }));

    expect(harness.frames.size).toBe(1);
    harness.flushUntilIdle();
    expect(handle.getPresentation().interactionOutput.translateX).toBeGreaterThan(0);

    vi.advanceTimersByTime(500);
    expect(harness.frames.size).toBe(1);
    harness.flushUntilIdle();
    expect(Math.abs(handle.getPresentation().interactionOutput.translateX))
      .toBeLessThan(0.01);

    handle.setInteractionState(pointerState(material, {
      isActive: true,
      isHovering: true,
    }));
    expect(harness.frames.size).toBe(1);
    context.destroy();
    expect(harness.frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses timer-backed frames when requestAnimationFrame is unavailable', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.stubGlobal('cancelAnimationFrame', undefined);
    const { context, handle, harness, material } = mountMaterialHarness('button', false);

    handle.setInteractionState(pointerState(material, {
      clientX: 120,
      isActive: true,
      isHovering: true,
    }));
    expect(harness.frames.size).toBe(0);
    vi.advanceTimersByTime(32);

    expect(handle.getPresentation().interactionOutput).toMatchObject({
      highlightVisible: true,
      isActive: true,
    });
    expect(handle.getPresentation().interactionOutput.scaleX).toBeGreaterThan(1);
    context.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects non-finite material rectangles before scheduling animation', () => {
    const { context, handle, harness, material } = mountMaterialHarness();
    const state = pointerState(material, {
      isActive: true,
      isHovering: true,
    });
    state.elementRect = {
      ...state.elementRect,
      left: Number.NaN,
    };

    expect(() => handle.setInteractionState(state)).toThrow();
    expect(harness.frames.size).toBe(0);
    context.destroy();
  });

  it('does not render after a presentation listener destroys the context', () => {
    const { context, handle, harness, material } = mountMaterialHarness();
    let presentations = 0;
    handle.onPresentation(() => {
      presentations += 1;
      if (presentations > 1) context.destroy();
    });
    handle.setInteractionState(pointerState(material, {
      isActive: true,
      isHovering: true,
    }));

    expect(() => harness.flushFrame()).not.toThrow();
    expect(context.destroyed).toBe(true);
    expect(harness.frames.size).toBe(0);
  });

  it('keeps animation scheduled after removing a failing presentation listener', () => {
    const { context, handle, harness, material } = mountMaterialHarness();
    let presentations = 0;
    handle.onPresentation(() => {
      presentations += 1;
      if (presentations > 1) throw new Error('animation listener failed');
    });
    handle.setInteractionState(pointerState(material, {
      isActive: true,
      isHovering: true,
    }));

    expect(() => harness.flushFrame()).toThrow('animation listener failed');
    expect(harness.frames.size).toBe(1);
    expect(() => harness.flushFrame()).not.toThrow();
    context.destroy();
  });

  it('keeps every fallback snapshot consistent when one listener throws', () => {
    const { container, context, handle } = mountMaterialHarness();
    const secondMaterial = new FakeElement({ x: 210, y: 30, width: 80, height: 80 });
    secondMaterial.parentElement = container as unknown as HTMLElement;
    const secondHandle = context.addMaterial({
      element: secondMaterial as unknown as HTMLElement,
    });
    let presentations = 0;
    handle.onPresentation(() => {
      presentations += 1;
      if (presentations > 1) throw new Error('presentation failed');
    });

    expect(() => context.setFallbackMode(true)).toThrow('presentation failed');
    expect(handle.getPresentation().fallbackMode).toBe(true);
    expect(secondHandle.getPresentation().fallbackMode).toBe(true);
    expect(secondMaterial.getAttribute('is-fallback-mode')).toBe('true');
    context.destroy();
  });
});
