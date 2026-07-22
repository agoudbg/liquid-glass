import { describe, expect, it, vi } from 'vitest';

import type { DomCaptureResult } from '../../src/backdrop/dom-capture';
import {
  type DomBackdropCaptureCallbacks,
  DomBackdropCaptureController,
} from '../../src/engine/DomBackdropCaptureController';
import type { BackdropRegistration } from '../../src/engine/registrations';
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
    getBoundingClientRect: () => domRect(rect),
    scrollHeight: rect.height,
    scrollWidth: rect.width,
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
    onCaptured: vi.fn(),
    onError: vi.fn(),
    removeSource: (registration) => {
      registration.destroyed = true;
      sources.delete(registration.id);
      getController().sourceRemoved();
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
    expect(onCaptured).toHaveBeenCalledWith(expect.objectContaining({
      id: replacement.id,
      canvas: replacementCanvas,
    }));
    expect(capture).toHaveBeenCalledTimes(2);
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
    expect(onCaptured).toHaveBeenCalledWith(expect.objectContaining({
      id: successful.id,
      canvas: successfulCanvas,
    }));
    expect(renderFrame).toHaveBeenCalledOnce();
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
});
