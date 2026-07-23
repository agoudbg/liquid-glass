import { describe, expect, it, vi } from 'vitest';

import { GlassEngine, type GlassEngineRuntime } from '../../src/engine';
import type { RectLike } from '../../src/types';
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
  readonly children: HTMLCanvasElement[] = [];
  readonly firstElementChild: Element | null = null;
  readonly offsetHeight: number;
  readonly offsetWidth: number;
  readonly scrollHeight: number;
  readonly scrollWidth: number;
  parentElement: HTMLElement | null = null;
  private readonly attributes = new Map<string, string>();

  constructor(private readonly rect: RectLike) {
    this.offsetHeight = rect.height;
    this.offsetWidth = rect.width;
    this.scrollHeight = rect.height;
    this.scrollWidth = rect.width;
  }

  appendChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    (canvas as unknown as FakeCanvas).parentNode = this;
    this.children.push(canvas);
    return canvas;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  getBoundingClientRect(): DOMRectReadOnly {
    return domRect(this.rect);
  }

  querySelectorAll(): Element[] {
    return [];
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  removeChild(canvas: HTMLCanvasElement): HTMLCanvasElement {
    this.children.splice(this.children.indexOf(canvas), 1);
    (canvas as unknown as FakeCanvas).parentNode = null;
    return canvas;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

interface ListenerRecord {
  active: boolean;
  listener: EventListener;
  target: EventTarget;
  type: string;
}

describe('GlassContext inactive-page presentation', () => {
  it('updates every material without drawing and responds to option changes', () => {
    const browserWindow = {} as Window;
    let documentFocused = true;
    let documentHidden = false;
    const browserDocument = {
      get hidden() {
        return documentHidden;
      },
      hasFocus: () => documentFocused,
    } as Document;
    const listeners: ListenerRecord[] = [];
    const canvases: FakeCanvas[] = [];
    const runtime: GlassEngineRuntime = {
      addEventListener: (target, type, listener) => {
        const record = { active: true, listener, target, type };
        listeners.push(record);
        return () => {
          record.active = false;
        };
      },
      createCanvas: () => {
        const canvas = new FakeCanvas();
        canvases.push(canvas);
        return canvas as unknown as HTMLCanvasElement;
      },
      createResizeObserver: () => null,
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({
        borderBottomLeftRadius: '0px',
        borderBottomRightRadius: '0px',
        borderTopLeftRadius: '0px',
        borderTopRightRadius: '0px',
        display: 'block',
        opacity: '1',
        overflow: 'visible',
        overflowX: 'visible',
        overflowY: 'visible',
        transform: 'none',
        visibility: 'visible',
      }) as CSSStyleDeclaration,
      getDocument: () => browserDocument,
      getWindow: () => browserWindow,
    };
    const emitWindow = (type: string): void => {
      documentFocused = type !== 'blur';
      for (const record of listeners) {
        if (record.active && record.target === browserWindow && record.type === type) {
          record.listener({ type } as Event);
        }
      }
    };
    const emitDocument = (type: string): void => {
      for (const record of listeners) {
        if (record.active && record.target === browserDocument && record.type === type) {
          record.listener({ type } as Event);
        }
      }
    };
    const container = new FakeElement({ x: 0, y: 0, width: 320, height: 180 });
    const first = new FakeElement({ x: 20, y: 20, width: 100, height: 60 });
    const second = new FakeElement({ x: 140, y: 20, width: 100, height: 60 });
    first.parentElement = container as unknown as HTMLElement;
    second.parentElement = container as unknown as HTMLElement;
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
      { enableBlurredEffect: true },
    );
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 0, y: 0, width: 320, height: 180 }));
    context.addBackdropSource({
      draw: (drawingContext) => drawingContext.fillRect(0, 0, 320, 180),
      element: backdrop as unknown as HTMLCanvasElement,
      kind: 'canvas',
    });
    const firstHandle = context.addMaterial({
      element: first as unknown as HTMLElement,
    });
    const secondHandle = context.addMaterial({
      element: second as unknown as HTMLElement,
    });
    const onRendered = vi.fn();
    const onFullCanvasRendered = vi.fn();
    const firstPresentations: boolean[] = [];
    const secondPresentations: boolean[] = [];
    context.on('materialsRendered', onRendered);
    context.on('fullCanvasRendered', onFullCanvasRendered);
    firstHandle.onPresentation(({ blurred }) => firstPresentations.push(blurred));
    secondHandle.onPresentation(({ blurred }) => secondPresentations.push(blurred));
    const rendererCanvas = canvases[0];
    if (!rendererCanvas) throw new Error('Missing renderer canvas.');
    const { gl } = rendererCanvas;
    const draws = callsNamed(gl, 'drawArrays').length;
    expect(draws).toBeGreaterThan(0);

    emitWindow('blur');
    expect(firstHandle.getPresentation().blurred).toBe(true);
    expect(secondHandle.getPresentation().blurred).toBe(true);
    expect(firstPresentations).toEqual([false, true]);
    expect(secondPresentations).toEqual([false, true]);

    emitWindow('focus');
    expect(firstHandle.getPresentation().blurred).toBe(false);
    expect(secondHandle.getPresentation().blurred).toBe(false);
    documentHidden = true;
    documentFocused = false;
    emitDocument('visibilitychange');
    expect(firstHandle.getPresentation().blurred).toBe(true);
    expect(secondHandle.getPresentation().blurred).toBe(true);
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(draws);
    expect(onRendered).not.toHaveBeenCalled();
    expect(onFullCanvasRendered).not.toHaveBeenCalled();

    context.updateOptions({ enableBlurredEffect: false });
    expect(firstHandle.getPresentation().blurred).toBe(false);
    expect(secondHandle.getPresentation().blurred).toBe(false);
    const presentationCount = firstPresentations.length;
    const drawsAfterOptions = callsNamed(gl, 'drawArrays').length;
    onRendered.mockClear();
    onFullCanvasRendered.mockClear();
    emitWindow('blur');
    emitDocument('visibilitychange');
    expect(firstHandle.getPresentation().blurred).toBe(false);
    expect(secondHandle.getPresentation().blurred).toBe(false);
    expect(firstPresentations).toHaveLength(presentationCount);
    expect(secondPresentations).toHaveLength(presentationCount);
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(drawsAfterOptions);
    expect(onRendered).not.toHaveBeenCalled();
    expect(onFullCanvasRendered).not.toHaveBeenCalled();
    context.destroy();
    expect(listeners.every(({ active }) => !active)).toBe(true);
    emitWindow('focus');
    emitDocument('visibilitychange');
    expect(firstPresentations).toHaveLength(presentationCount);
    expect(secondPresentations).toHaveLength(presentationCount);
  });
});
