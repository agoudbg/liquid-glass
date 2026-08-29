import { describe, expect, it, vi } from 'vitest';

import type { DomCaptureResult } from '../../src/backdrop/dom-capture';
import {
  type DomBackdropCaptureCallbacks,
  DomBackdropCaptureController,
} from '../../src/engine/DomBackdropCaptureController';
import type {
  BackdropRegistration,
  CanvasBackdropRegistration,
} from '../../src/engine/registrations';
import type { GlassEngineRuntime } from '../../src/engine/runtime';
import type { RectLike } from '../../src/types';
import { FakeCanvas } from '../fixtures/fake-webgl2';

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

function createElement(rect: RectLike): HTMLElement {
  return {
    firstElementChild: null,
    getBoundingClientRect: () => domRect(rect),
    querySelectorAll: () => [],
    scrollHeight: rect.height,
    scrollWidth: rect.width,
  } as unknown as HTMLElement;
}

interface MutableElementState {
  rect: RectLike;
  scrollHeight: number;
  scrollWidth: number;
}

function createMutableElement(state: MutableElementState): HTMLElement {
  return {
    firstElementChild: null,
    get parentElement() {
      return null;
    },
    get scrollHeight() {
      return state.scrollHeight;
    },
    get scrollWidth() {
      return state.scrollWidth;
    },
    getBoundingClientRect: () => domRect(state.rect),
    querySelectorAll: () => [],
  } as unknown as HTMLElement;
}

function deferred<Value>(): {
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

function createFrameRuntime(): {
  flush(): void;
  frames: Map<number, FrameRequestCallback>;
  runtime: GlassEngineRuntime;
} {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrameId = 1;
  return {
    frames,
    flush: () => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) {
        callback(16);
      }
    },
    runtime: {
      cancelAnimationFrame: (frameId) => frames.delete(frameId),
      createCanvas: () => new FakeCanvas() as unknown as HTMLCanvasElement,
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
      getViewportRect: () => ({ x: 0, y: 0, width: 320, height: 180 }),
      requestAnimationFrame: (callback) => {
        const frameId = nextFrameId++;
        frames.set(frameId, callback);
        return frameId;
      },
    },
  };
}

function createController(
  runtime: GlassEngineRuntime,
  sources: Map<string, BackdropRegistration>,
  overrides: Partial<DomBackdropCaptureCallbacks> = {},
): DomBackdropCaptureController {
  const controllerRef: { current: DomBackdropCaptureController | null } = {
    current: null,
  };
  const getController = (): DomBackdropCaptureController => {
    if (!controllerRef.current) {
      throw new Error('Controller is not initialized.');
    }
    return controllerRef.current;
  };
  const callbacks: DomBackdropCaptureCallbacks = {
    assertRegistration: (registration) => {
      if (registration.destroyed) {
        throw new Error('Registration is destroyed.');
      }
    },
    getDeviceScale: () => 1,
    getOptions: () => ({}),
    getViewportMode: () => false,
    isContextDestroyed: () => false,
    isDiagnosticsEnabled: () => false,
    onCaptured: vi.fn(),
    onError: vi.fn(),
    removeSource: (registration) => {
      registration.destroyed = true;
      sources.delete(registration.id);
      getController().sourceRemoved(registration);
    },
    renderFrame: vi.fn(),
    requestComposite: (reason) => {
      getController().requestComposite(reason);
    },
    ...overrides,
  };
  const controller = new DomBackdropCaptureController(
    createElement({ x: 0, y: 0, width: 320, height: 180 }),
    sources,
    runtime,
    callbacks,
  );
  controllerRef.current = controller;
  return controller;
}

describe('DomBackdropCaptureController', () => {
  it('prevents a retired scheduler from capturing its replacement source', async () => {
    const { flush, runtime } = createFrameRuntime();
    const sources = new Map<string, BackdropRegistration>();
    const firstCapture = deferred<DomCaptureResult>();
    const replacementCanvas = new FakeCanvas();
    const capture = vi.fn<NonNullable<GlassEngineRuntime['captureDomElement']>>()
      .mockImplementationOnce(() => firstCapture.promise)
      .mockImplementationOnce(async () => ({
        canvas: replacementCanvas as unknown as HTMLCanvasElement,
        viewportRect: { x: 0, y: 0, width: 320, height: 180 },
      }));
    runtime.captureDomElement = capture;
    const onCaptured = vi.fn();
    const controller = createController(runtime, sources, { onCaptured });

    const first = controller.add({
      kind: 'dom',
      element: createElement({ x: 0, y: 0, width: 320, height: 180 }),
    });
    flush();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
    first.destroy();

    const replacement = controller.add({
      kind: 'dom',
      element: createElement({ x: 0, y: 0, width: 320, height: 180 }),
    });
    flush();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    firstCapture.resolve({
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      viewportRect: { x: 0, y: 0, width: 320, height: 180 },
    });

    await vi.waitFor(() => expect(onCaptured).toHaveBeenCalledOnce());
    expect(onCaptured).toHaveBeenCalledWith(
      expect.objectContaining({
        id: replacement.id,
        canvas: replacementCanvas,
        viewportRect: { x: 0, y: 0, width: 320, height: 180 },
      }),
      null,
    );
    expect(capture).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it('aborts a removed source without blocking the remaining capture queue', async () => {
    const { flush, runtime } = createFrameRuntime();
    const sources = new Map<string, BackdropRegistration>();
    const stalledCapture = deferred<DomCaptureResult>();
    const requests: Parameters<NonNullable<GlassEngineRuntime['captureDomElement']>>[0][] = [];
    const capture = vi.fn<NonNullable<GlassEngineRuntime['captureDomElement']>>()
      .mockImplementationOnce((request) => {
        requests.push(request);
        return stalledCapture.promise;
      })
      .mockImplementationOnce(async (request) => {
        requests.push(request);
        return {
          canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
          viewportRect: { x: 0, y: 0, width: 320, height: 180 },
        };
      });
    runtime.captureDomElement = capture;
    const onCaptured = vi.fn();
    const controller = createController(runtime, sources, { onCaptured });
    const first = controller.add({
      kind: 'dom',
      element: createElement({ x: 0, y: 0, width: 320, height: 180 }),
    });
    const second = controller.add({
      kind: 'dom',
      element: createElement({ x: 0, y: 0, width: 320, height: 180 }),
    });
    flush();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());

    first.destroy();
    controller.request('structural');
    flush();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    expect(requests[0]?.signal?.aborted).toBe(true);
    await vi.waitFor(() => {
      expect(onCaptured).toHaveBeenCalledWith(
        expect.objectContaining({
          id: second.id,
        }),
        null,
      );
    });
    controller.destroy();
  });

  it('recaptures a viewport source moved beyond its cached bitmap', async () => {
    const { flush, runtime } = createFrameRuntime();
    const mutationCallbacks: MutationCallback[] = [];
    runtime.createMutationObserver = (callback) => {
      mutationCallbacks.push(callback);
      return {
        disconnect: vi.fn(),
        observe: vi.fn(),
        takeRecords: () => [],
      } as MutationObserver;
    };
    const capture = vi.fn<NonNullable<GlassEngineRuntime['captureDomElement']>>()
      .mockImplementation(async (request) => {
        if (!request.captureRect) {
          throw new Error('Viewport capture must provide a bounded rectangle.');
        }
        return {
          canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
          viewportRect: request.captureRect,
        };
      });
    runtime.captureDomElement = capture;
    const sources = new Map<string, BackdropRegistration>();
    const onCaptured = vi.fn();
    const controller = createController(runtime, sources, { onCaptured });
    const state: MutableElementState = {
      rect: { x: 0, y: 0, width: 320, height: 1_000 },
      scrollHeight: 1_000,
      scrollWidth: 320,
    };
    controller.add({
      kind: 'dom',
      element: createMutableElement(state),
      viewportCapture: true,
      watchNodeChanges: false,
      watchPositionChanges: true,
      watchResize: false,
    });
    flush();
    await vi.waitFor(() => expect(onCaptured).toHaveBeenCalledOnce());

    state.rect = { ...state.rect, y: -400 };
    mutationCallbacks[0]?.([], {} as MutationObserver);
    flush();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    controller.destroy();
  });

  it('marks observed canvas resizes dirty but reuses pixels for movement', () => {
    const { runtime } = createFrameRuntime();
    const mutationCallbacks: MutationCallback[] = [];
    const resizeCallbacks: ResizeObserverCallback[] = [];
    runtime.createMutationObserver = (callback) => {
      mutationCallbacks.push(callback);
      return {
        disconnect: vi.fn(),
        observe: vi.fn(),
        takeRecords: () => [],
      } as MutationObserver;
    };
    runtime.createResizeObserver = (callback) => {
      resizeCallbacks.push(callback);
      return {
        disconnect: vi.fn(),
        observe: vi.fn(),
        takeRecords: () => [],
        unobserve: vi.fn(),
      } as ResizeObserver;
    };
    const state: MutableElementState = {
      rect: { x: 0, y: 0, width: 320, height: 180 },
      scrollHeight: 180,
      scrollWidth: 320,
    };
    const element = createMutableElement(state) as HTMLCanvasElement;
    const registration: CanvasBackdropRegistration = {
      id: 'canvas-observed',
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      config: {
        kind: 'canvas',
        draw: () => undefined,
        element,
        watchPositionChanges: true,
        watchResize: true,
      },
      destroyed: false,
      dirty: false,
    };
    const sources = new Map<string, BackdropRegistration>([[
      registration.id,
      registration,
    ]]);
    const requestComposite = vi.fn();
    const controller = createController(runtime, sources, { requestComposite });
    controller.sourceAdded(registration);

    resizeCallbacks[0]?.([], {} as ResizeObserver);
    expect(registration.dirty).toBe(true);
    registration.dirty = false;
    state.rect = { ...state.rect, x: 25 };
    mutationCallbacks[0]?.([], {} as MutationObserver);
    expect(registration.dirty).toBe(false);
    expect(requestComposite).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it('isolates a failed source and still captures later sources in the frame', async () => {
    const { flush, runtime } = createFrameRuntime();
    const sources = new Map<string, BackdropRegistration>();
    const successfulCanvas = new FakeCanvas();
    const failure = new Error('capture failed');
    const capture = vi.fn<NonNullable<GlassEngineRuntime['captureDomElement']>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({
        canvas: successfulCanvas as unknown as HTMLCanvasElement,
        viewportRect: { x: 0, y: 0, width: 320, height: 180 },
      });
    runtime.captureDomElement = capture;
    const onCaptured = vi.fn();
    const onError = vi.fn();
    const renderFrame = vi.fn();
    const controller = createController(runtime, sources, {
      onCaptured,
      onError,
      renderFrame,
    });

    const failed = controller.add({
      kind: 'dom',
      element: createElement({ x: 0, y: 0, width: 320, height: 180 }),
    });
    const successful = controller.add({
      kind: 'dom',
      element: createElement({ x: 0, y: 0, width: 320, height: 180 }),
    });
    flush();

    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      backdropId: failed.id,
      code: 'CAPTURE_FAILED',
      error: failure,
    }));
    expect(onCaptured).toHaveBeenCalledWith(
      expect.objectContaining({
        id: successful.id,
        canvas: successfulCanvas,
      }),
      null,
    );
    expect(renderFrame).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it('pauses DOM rasterization while preserving dirty registrations for recovery', async () => {
    const { flush, frames, runtime } = createFrameRuntime();
    const sources = new Map<string, BackdropRegistration>();
    const capture = vi.fn<NonNullable<GlassEngineRuntime['captureDomElement']>>()
      .mockResolvedValue({
        canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
        viewportRect: { x: 0, y: 0, width: 320, height: 180 },
      });
    runtime.captureDomElement = capture;
    const controller = createController(runtime, sources);

    controller.setPaused(true);
    controller.add({
      kind: 'dom',
      element: createElement({ x: 0, y: 0, width: 320, height: 180 }),
    });
    expect(controller.active).toBe(false);
    expect(frames.size).toBe(0);
    flush();
    expect(capture).not.toHaveBeenCalled();

    controller.setPaused(false);
    expect(controller.active).toBe(true);
    controller.request('fallback');
    flush();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
    controller.destroy();
  });

  it('rolls back registration when initial frame scheduling fails', () => {
    const { runtime } = createFrameRuntime();
    runtime.requestAnimationFrame = () => {
      throw new Error('RAF unavailable');
    };
    const sources = new Map<string, BackdropRegistration>();
    const controller = createController(runtime, sources);

    expect(() => controller.add({
      kind: 'dom',
      element: createElement({ x: 0, y: 0, width: 320, height: 180 }),
    })).toThrow('RAF unavailable');
    expect(sources.size).toBe(0);
    expect(controller.active).toBe(false);
  });

  it('restores the previous configuration after observer rebinding fails', () => {
    const { runtime } = createFrameRuntime();
    let observerCount = 0;
    runtime.createResizeObserver = () => {
      observerCount += 1;
      return {
        disconnect: vi.fn(),
        observe: () => {
          if (observerCount === 2) {
            throw new Error('observer update failed');
          }
        },
        takeRecords: () => [],
        unobserve: vi.fn(),
      } as ResizeObserver;
    };
    const sources = new Map<string, BackdropRegistration>();
    const controller = createController(runtime, sources);
    const handle = controller.add({
      kind: 'dom',
      element: createElement({ x: 0, y: 0, width: 320, height: 180 }),
      watchNodeChanges: false,
      watchResize: true,
      zIndex: 1,
    });

    expect(() => handle.update({ zIndex: 2 })).toThrow('observer update failed');
    expect(sources.get(handle.id)?.config.zIndex).toBe(1);
    expect(controller.getDiagnosticsState().resources.resizeObservers).toBe(1);
    controller.destroy();
  });

  it('preserves add failure while completing observer and scheduler rollback', () => {
    const { runtime } = createFrameRuntime();
    const operationFailure = new Error('composite failed');
    runtime.createResizeObserver = () => ({
      disconnect: () => {
        throw new Error('observer cleanup failed');
      },
      observe: vi.fn(),
      takeRecords: () => [],
      unobserve: vi.fn(),
    } as ResizeObserver);
    const sources = new Map<string, BackdropRegistration>();
    const controller = createController(runtime, sources, {
      requestComposite: () => {
        throw operationFailure;
      },
    });

    expect(() => controller.add({
      kind: 'dom',
      element: createElement({ x: 0, y: 0, width: 320, height: 180 }),
      watchNodeChanges: false,
      watchResize: true,
    })).toThrow(operationFailure);
    expect(sources.size).toBe(0);
    expect(controller.active).toBe(false);
  });
});
