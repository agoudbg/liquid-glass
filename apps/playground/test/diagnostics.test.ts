import type {
  GlassContext,
  GlassErrorContext,
} from '@agou/liquid-glass-core';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { observeGlassContext } from '../src/shared/diagnostics';

type ObservedListener = (...arguments_: unknown[]) => void;

describe('playground context diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('observes core frame and error events without claiming the public canvas context', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const getContext = vi.spyOn(canvas, 'getContext');
    const listeners = new Map<string, ObservedListener>();
    const stopListeners: Array<ReturnType<typeof vi.fn>> = [];
    const scheduledFrames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    const requestFrame = vi.fn((callback: FrameRequestCallback): number => {
      nextFrame += 1;
      scheduledFrames.set(nextFrame, callback);
      return nextFrame;
    });
    const cancelFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    const refresh = vi.fn();
    let fallbackMode = false;
    const context = {
      canvas,
      get fallbackMode(): boolean {
        return fallbackMode;
      },
      on: (event: string, listener: ObservedListener) => {
        listeners.set(event, listener);
        const stop = vi.fn(() => listeners.delete(event));
        stopListeners.push(stop);
        return stop;
      },
      refresh,
    } as unknown as GlassContext;
    const reports = vi.fn();

    const stop = observeGlassContext(context, reports);
    emit(listeners, 'materialsRendered', { canvas });

    expect(getContext).not.toHaveBeenCalled();
    expect(reports).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'ready',
      frameCount: 1,
      canvasWidth: 320,
      canvasHeight: 180,
      glError: 'NO_ERROR',
      error: null,
    }));

    emit(listeners, 'error', {
      code: 'RENDER_FAILED',
      error: new Error('Synthetic render failure.'),
      message: 'Synthetic render failure.',
      phase: 'render',
    } satisfies GlassErrorContext);
    expect(reports).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'error',
      glError: null,
      error: 'RENDER_FAILED: Synthetic render failure.',
    }));

    fallbackMode = true;
    emit(listeners, 'fallbackModeChanged', true);
    expect(reports).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'ready',
      fallbackMode: true,
      glError: 'NO_ERROR',
    }));

    scheduledFrames.get(1)?.(0);
    scheduledFrames.get(2)?.(16);
    expect(refresh).toHaveBeenCalledWith('structural');

    stop();
    expect(cancelFrame).toHaveBeenCalledWith(2);
    expect(stopListeners).toHaveLength(4);
    expect(stopListeners.every((listener) => listener.mock.calls.length === 1))
      .toBe(true);
  });
});

function emit(
  listeners: ReadonlyMap<string, ObservedListener>,
  event: string,
  ...arguments_: unknown[]
): void {
  const listener = listeners.get(event);
  if (!listener) throw new Error(`Missing observed listener: ${event}`);
  listener(...arguments_);
}
