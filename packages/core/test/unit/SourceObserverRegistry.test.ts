import { describe, expect, it, vi } from 'vitest';

import type {
  CanvasBackdropRegistration,
  DomBackdropRegistration,
} from '../../src/engine/registrations';
import type { GlassEngineRuntime } from '../../src/engine/runtime';
import { SourceObserverRegistry } from '../../src/engine/SourceObserverRegistry';
import type { RectLike } from '../../src/types';

interface FakeElementState {
  firstElementChild: Element | null;
  images: EventTarget[];
  parentElement: HTMLElement | null;
  rect: RectLike;
}

interface ListenerRecord {
  active: boolean;
  listener: EventListener;
  target: EventTarget;
  type: string;
}

interface MutationObserverRecord {
  callback: MutationCallback;
  disconnected: boolean;
  observed: Array<{ options?: MutationObserverInit; target: Node }>;
  observer: MutationObserver;
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

function element(state: FakeElementState): HTMLElement {
  return {
    get firstElementChild() {
      return state.firstElementChild;
    },
    get parentElement() {
      return state.parentElement;
    },
    getBoundingClientRect: () => domRect(state.rect),
    querySelectorAll: () => state.images as unknown as NodeListOf<HTMLImageElement>,
  } as unknown as HTMLElement;
}

describe('SourceObserverRegistry', () => {
  it('rebinds dynamic content, distinguishes movement, and releases every handle', () => {
    const listeners: ListenerRecord[] = [];
    const mutationRecords: MutationObserverRecord[] = [];
    const resizeRecords: ResizeObserverRecord[] = [];
    const runtime: GlassEngineRuntime = {
      addEventListener: (target, type, listener) => {
        const record = { active: true, listener, target, type };
        listeners.push(record);
        return () => {
          record.active = false;
        };
      },
      createCanvas: () => {
        throw new Error('Canvas creation is not used by observer tests.');
      },
      createMutationObserver: (callback) => {
        const record = {
          callback,
          disconnected: false,
          observed: [],
        } as unknown as MutationObserverRecord;
        const observer = {
          disconnect: () => {
            record.disconnected = true;
          },
          observe: (target: Node, options?: MutationObserverInit) => {
            record.observed.push({ options, target });
          },
          takeRecords: () => [],
        } as MutationObserver;
        record.observer = observer;
        mutationRecords.push(record);
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
            record.observed.push(target);
          },
          takeRecords: () => [],
          unobserve: vi.fn(),
        } as ResizeObserver;
        record.observer = observer;
        resizeRecords.push(record);
        return observer;
      },
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    };
    const parent = {} as HTMLElement;
    const firstChild = {} as Element;
    const replacementChild = {} as Element;
    const firstImage = {} as EventTarget;
    const replacementImage = {} as EventTarget;
    const state: FakeElementState = {
      firstElementChild: firstChild,
      images: [firstImage],
      parentElement: parent,
      rect: { x: 10, y: 20, width: 300, height: 200 },
    };
    const root = element(state);
    const registration: DomBackdropRegistration = {
      id: 'dom-observed',
      canvas: null,
      captureVersion: 0,
      config: { kind: 'dom', element: root, watchPositionChanges: true },
      destroyed: false,
      dirty: false,
      viewportRect: null,
    };
    const onInvalidate = vi.fn();
    const registry = new SourceObserverRegistry(runtime, onInvalidate);

    registry.track(registration);
    expect(resizeRecords[0]?.observed).toEqual([root, firstChild]);
    expect(mutationRecords).toHaveLength(2);
    expect(mutationRecords[0]?.observed[0]?.target).toBe(root);
    expect(mutationRecords[0]?.observed[0]?.options).toEqual({
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    expect(mutationRecords[1]?.observed[0]?.target).toBe(parent);
    expect(listeners.filter((record) => record.active)).toHaveLength(1);

    state.firstElementChild = replacementChild;
    state.images = [replacementImage];
    mutationRecords[0]?.callback([], mutationRecords[0].observer);
    expect(resizeRecords[0]?.disconnected).toBe(true);
    expect(resizeRecords[1]?.observed).toEqual([root, replacementChild]);
    expect(onInvalidate).toHaveBeenCalledWith(registration, 'structural', true);
    expect(listeners.filter((record) => record.active).map((record) => record.target))
      .toEqual([replacementImage]);

    resizeRecords[1]?.callback([], resizeRecords[1].observer);
    expect(onInvalidate).toHaveBeenCalledWith(registration, 'layout', true);
    const imageListener = listeners.find((record) => (
      record.active && record.target === replacementImage
    ));
    imageListener?.listener({ type: 'load' } as Event);
    expect(onInvalidate).toHaveBeenLastCalledWith(
      registration,
      'structural',
      true,
    );

    state.rect = { ...state.rect, x: 30 };
    mutationRecords[1]?.callback([], mutationRecords[1].observer);
    expect(onInvalidate).toHaveBeenLastCalledWith(
      registration,
      'layout',
      false,
    );

    const replacementParent = {} as HTMLElement;
    state.parentElement = replacementParent;
    mutationRecords[1]?.callback([], mutationRecords[1].observer);
    expect(mutationRecords[1]?.disconnected).toBe(true);
    expect(mutationRecords[2]?.observed[0]?.target).toBe(replacementParent);
    state.rect = { ...state.rect, x: 45 };
    mutationRecords[2]?.callback([], mutationRecords[2].observer);
    expect(onInvalidate).toHaveBeenLastCalledWith(
      registration,
      'layout',
      false,
    );

    registration.config = {
      ...registration.config,
      watchNodeChanges: false,
      watchPositionChanges: false,
      watchResize: false,
    };
    registry.update(registration);
    expect(resizeRecords.every((record) => record.disconnected)).toBe(true);
    expect(mutationRecords.every((record) => record.disconnected)).toBe(true);
    expect(listeners.every((record) => !record.active)).toBe(true);
    registry.destroy();
  });

  it('observes clipping ancestors and opt-in canvas geometry', () => {
    const mutationCallbacks: MutationCallback[] = [];
    const resizeRecords: ResizeObserverRecord[] = [];
    const clippingParent = { parentElement: null } as unknown as HTMLElement;
    const runtime: GlassEngineRuntime = {
      createCanvas: () => {
        throw new Error('Canvas creation is not used by observer tests.');
      },
      createMutationObserver: (callback) => {
        mutationCallbacks.push(callback);
        return {
          disconnect: vi.fn(),
          observe: vi.fn(),
          takeRecords: () => [],
        } as MutationObserver;
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
          observe: (target: Element) => record.observed.push(target),
          takeRecords: () => [],
          unobserve: vi.fn(),
        } as ResizeObserver;
        record.observer = observer;
        resizeRecords.push(record);
        return observer;
      },
      devicePixelRatio: () => 1,
      getComputedStyle: (target) => ({
        overflow: target === clippingParent ? 'hidden' : 'visible',
        overflowX: '',
        overflowY: '',
      }) as CSSStyleDeclaration,
    };
    const domRoot = {
      firstElementChild: null,
      parentElement: clippingParent,
      getBoundingClientRect: () => domRect({ x: 0, y: 0, width: 200, height: 100 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement;
    const domRegistration: DomBackdropRegistration = {
      id: 'dom-clipped',
      canvas: null,
      captureVersion: 0,
      config: {
        kind: 'dom',
        element: domRoot,
        watchNodeChanges: false,
        watchPositionChanges: false,
        watchResize: false,
      },
      destroyed: false,
      dirty: false,
      viewportRect: null,
    };
    const onInvalidate = vi.fn();
    const registry = new SourceObserverRegistry(runtime, onInvalidate);

    registry.track(domRegistration);
    expect(resizeRecords[0]?.observed).toEqual([clippingParent]);
    resizeRecords[0]?.callback([], resizeRecords[0].observer);
    expect(onInvalidate).toHaveBeenLastCalledWith(
      domRegistration,
      'layout',
      true,
    );
    registry.untrack(domRegistration);

    const canvasState = { x: 0 };
    const canvas = {
      parentElement: null,
      getBoundingClientRect: () => domRect({
        x: canvasState.x,
        y: 0,
        width: 200,
        height: 100,
      }),
    } as unknown as HTMLCanvasElement;
    const canvasRegistration: CanvasBackdropRegistration = {
      id: 'canvas-observed',
      canvas,
      config: {
        kind: 'canvas',
        draw: () => undefined,
        element: canvas,
        watchPositionChanges: true,
        watchResize: true,
      },
      destroyed: false,
      dirty: false,
    };
    registry.track(canvasRegistration);
    expect(resizeRecords[1]?.observed).toEqual([canvas]);
    canvasState.x = 25;
    mutationCallbacks[0]?.([], {} as MutationObserver);
    expect(onInvalidate).toHaveBeenLastCalledWith(
      canvasRegistration,
      'layout',
      false,
    );
    resizeRecords[1]?.callback([], resizeRecords[1].observer);
    expect(onInvalidate).toHaveBeenLastCalledWith(
      canvasRegistration,
      'layout',
      true,
    );
    registry.destroy();
  });

  it('keeps core position observation opt-in by default', () => {
    const createMutationObserver = vi.fn((_callback: MutationCallback) => ({
      disconnect: vi.fn(),
      observe: vi.fn(),
      takeRecords: () => [],
    }) as MutationObserver);
    const root = {
      firstElementChild: null,
      parentElement: null,
      getBoundingClientRect: () => domRect({ x: 0, y: 0, width: 10, height: 10 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement;
    const registration: DomBackdropRegistration = {
      id: 'dom-default-position',
      canvas: null,
      captureVersion: 0,
      config: {
        kind: 'dom',
        element: root,
        watchNodeChanges: false,
        watchResize: false,
      },
      destroyed: false,
      dirty: false,
      viewportRect: null,
    };
    const registry = new SourceObserverRegistry({
      createCanvas: () => {
        throw new Error('Canvas creation is not used by observer tests.');
      },
      createMutationObserver,
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    }, vi.fn());

    registry.track(registration);
    expect(createMutationObserver).not.toHaveBeenCalled();
    registry.destroy();
  });

  it('disconnects partially configured observers when tracking fails', () => {
    const disconnect = vi.fn();
    const root = {
      firstElementChild: null,
      parentElement: null,
      getBoundingClientRect: () => domRect({ x: 0, y: 0, width: 10, height: 10 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement;
    const registration: DomBackdropRegistration = {
      id: 'dom-invalid-observer',
      canvas: null,
      captureVersion: 0,
      config: {
        kind: 'dom',
        element: root,
        watchNodeChanges: false,
        watchPositionChanges: false,
      },
      destroyed: false,
      dirty: false,
      viewportRect: null,
    };
    const registry = new SourceObserverRegistry({
      createCanvas: () => {
        throw new Error('Canvas creation is not used by observer tests.');
      },
      createResizeObserver: () => ({
        disconnect,
        observe: () => {
          throw new Error('Resize observation failed.');
        },
        takeRecords: () => [],
        unobserve: vi.fn(),
      }) as ResizeObserver,
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    }, vi.fn());

    expect(() => registry.track(registration)).toThrow('Resize observation failed.');
    expect(disconnect).toHaveBeenCalledOnce();
    registry.destroy();
  });
});
