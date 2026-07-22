import { describe, expect, it, vi } from 'vitest';

import { DirtyFrameScheduler } from '../../src/backdrop/DirtyFrameScheduler';
import type { TextureDirtyReason } from '../../src/types';

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
}

function deferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

function createFrameRuntime(): {
  cancelAnimationFrame: ReturnType<typeof vi.fn>;
  flushFrame(): void;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
} {
  let nextId = 1;
  const frames = new Map<number, FrameRequestCallback>();
  return {
    cancelAnimationFrame: vi.fn((id: number) => frames.delete(id)),
    flushFrame: () => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) {
        callback(16);
      }
    },
    requestAnimationFrame: (callback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
  };
}

describe('DirtyFrameScheduler', () => {
  it('coalesces a frame to the highest-priority dirty reason', async () => {
    const runtime = createFrameRuntime();
    const runs: TextureDirtyReason[] = [];
    const scheduler = new DirtyFrameScheduler(runtime, async (reason) => {
      runs.push(reason);
    });

    scheduler.request('scroll');
    scheduler.request('layout');
    scheduler.request('material_interaction');
    expect(scheduler.getState()).toMatchObject({ pendingFrame: true, running: false });

    runtime.flushFrame();
    await Promise.resolve();
    expect(runs).toEqual(['layout']);
    expect(scheduler.getState()).toEqual({ pendingFrame: false, running: false });
  });

  it('serializes async frames and preserves requests made during a run', async () => {
    const runtime = createFrameRuntime();
    const firstRun = deferred();
    const runs: TextureDirtyReason[] = [];
    const scheduler = new DirtyFrameScheduler(runtime, async (reason) => {
      runs.push(reason);
      if (runs.length === 1) {
        await firstRun.promise;
      }
    });

    scheduler.request('external');
    runtime.flushFrame();
    await Promise.resolve();
    expect(scheduler.getState()).toEqual({ pendingFrame: false, running: true });

    scheduler.request('scroll');
    scheduler.request('viewport');
    runtime.flushFrame();
    expect(runs).toEqual(['external']);

    firstRun.resolve();
    await firstRun.promise;
    await Promise.resolve();
    expect(scheduler.getState()).toMatchObject({ pendingFrame: true, running: false });

    runtime.flushFrame();
    await Promise.resolve();
    expect(runs).toEqual(['external', 'viewport']);
  });

  it('cancels pending work and ignores later requests after destroy', () => {
    const runtime = createFrameRuntime();
    const run = vi.fn();
    const scheduler = new DirtyFrameScheduler(runtime, run);

    scheduler.request('layout');
    scheduler.destroy();
    scheduler.request('external');
    runtime.flushFrame();

    expect(runtime.cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(scheduler.getState()).toEqual({ pendingFrame: false, running: false });
  });
});
