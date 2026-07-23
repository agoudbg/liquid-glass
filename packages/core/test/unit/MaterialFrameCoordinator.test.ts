import { describe, expect, it, vi } from 'vitest';

import {
  MaterialFrameCoordinator,
  type MaterialFrameTarget,
} from '../../src/engine/MaterialFrameCoordinator';
import type { GlassEngineRuntime } from '../../src/engine/runtime';
import type { MaterialChanges } from '../../src/types';

interface FrameRuntimeHarness {
  readonly cancelled: number[];
  readonly frames: Map<number, FrameRequestCallback>;
  readonly runtime: GlassEngineRuntime;
  flushNext(timestamp?: number): void;
  invoke(frameId: number, timestamp?: number): void;
}

interface CoordinatorHarness {
  readonly coordinator: MaterialFrameCoordinator;
  readonly frames: FrameRuntimeHarness;
  readonly publishUpdate: ReturnType<typeof vi.fn>;
  readonly renderMaterials: ReturnType<typeof vi.fn>;
  readonly targets: Map<string, MaterialFrameTarget>;
  setDestroyed(destroyed: boolean): void;
}

interface TargetOverrides {
  isMotionAtRest?: () => boolean;
  publish?: () => void;
  resetTimestamp?: () => void;
  step?: (timestamp: number) => boolean;
}

function createFrameRuntime(): FrameRuntimeHarness {
  const cancelled: number[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrameId = 0;
  const runtime: GlassEngineRuntime = {
    cancelAnimationFrame: (frameId) => {
      cancelled.push(frameId);
    },
    createCanvas: () => ({}) as HTMLCanvasElement,
    devicePixelRatio: () => 1,
    getComputedStyle: () => ({}) as CSSStyleDeclaration,
    requestAnimationFrame: (callback) => {
      nextFrameId += 1;
      frames.set(nextFrameId, callback);
      return nextFrameId;
    },
  };

  const invoke = (frameId: number, timestamp = 16): void => {
    const callback = frames.get(frameId);
    if (!callback) throw new Error(`Unknown frame ${frameId}.`);
    frames.delete(frameId);
    callback(timestamp);
  };

  return {
    cancelled,
    frames,
    runtime,
    flushNext: (timestamp = 16) => {
      const frameId = [...frames.keys()].find((id) => !cancelled.includes(id));
      if (frameId === undefined) throw new Error('No live frame is pending.');
      invoke(frameId, timestamp);
    },
    invoke,
  };
}

function createTarget(overrides: TargetOverrides = {}): MaterialFrameTarget {
  return {
    isMotionAtRest: vi.fn(overrides.isMotionAtRest ?? (() => true)),
    publish: vi.fn(overrides.publish ?? (() => undefined)),
    resetTimestamp: vi.fn(overrides.resetTimestamp ?? (() => undefined)),
    step: vi.fn(overrides.step ?? (() => false)),
  };
}

function createHarness(
  renderMaterials: () => void = () => undefined,
  publishUpdate: (
    materialId: string,
    changes: MaterialChanges,
  ) => void = () => undefined,
): CoordinatorHarness {
  const frames = createFrameRuntime();
  const targets = new Map<string, MaterialFrameTarget>();
  const render = vi.fn(renderMaterials);
  const publish = vi.fn(publishUpdate);
  let destroyed = false;
  const coordinator = new MaterialFrameCoordinator(frames.runtime, {
    getTarget: (materialId) => targets.get(materialId) ?? null,
    isDestroyed: () => destroyed,
    publishUpdate: publish,
    renderMaterials: render,
  });

  return {
    coordinator,
    frames,
    publishUpdate: publish,
    renderMaterials: render,
    targets,
    setDestroyed: (next) => {
      destroyed = next;
    },
  };
}

describe('MaterialFrameCoordinator', () => {
  it('coalesces render requests and advances active targets once per frame', () => {
    const harness = createHarness();
    const target = createTarget({ step: () => true });
    harness.targets.set('material', target);

    harness.coordinator.wake('material', target);
    harness.coordinator.wake('material', target);
    harness.coordinator.requestRender();
    harness.coordinator.requestRender();

    expect(harness.frames.frames.size).toBe(1);
    expect(target.resetTimestamp).toHaveBeenCalledOnce();
    harness.frames.flushNext(24);

    expect(target.step).toHaveBeenCalledOnce();
    expect(target.step).toHaveBeenCalledWith(24);
    expect(target.publish).toHaveBeenCalledOnce();
    expect(harness.renderMaterials).toHaveBeenCalledOnce();
    expect(harness.frames.frames.size).toBe(0);
  });

  it('uses a stable active snapshot and defers a target woken mid-frame', () => {
    const harness = createHarness();
    const second = createTarget();
    const first = createTarget({
      step: () => {
        harness.coordinator.wake('second', second);
        return false;
      },
    });
    harness.targets.set('first', first);
    harness.targets.set('second', second);
    harness.coordinator.wake('first', first);

    harness.frames.flushNext();

    expect(first.step).toHaveBeenCalledOnce();
    expect(second.step).not.toHaveBeenCalled();
    expect(harness.frames.frames.size).toBe(1);
    harness.frames.flushNext(32);
    expect(second.step).toHaveBeenCalledOnce();
  });

  it('preserves a render request made during a frame for the next tick', () => {
    const harness = createHarness();
    const target = createTarget({
      step: () => {
        harness.coordinator.requestRender();
        return false;
      },
    });
    harness.targets.set('material', target);
    harness.coordinator.wake('material', target);

    harness.frames.flushNext();

    expect(harness.renderMaterials).toHaveBeenCalledOnce();
    expect(harness.frames.frames.size).toBe(1);
    harness.frames.flushNext(32);
    expect(harness.renderMaterials).toHaveBeenCalledOnce();
    expect(harness.frames.frames.size).toBe(0);
  });

  it('publishes every changed target before throwing the first listener error', () => {
    const harness = createHarness();
    const firstError = new Error('first listener failed');
    const secondError = new Error('second listener failed');
    const first = createTarget({
      publish: () => {
        throw firstError;
      },
      step: () => true,
    });
    const second = createTarget({
      publish: () => {
        throw secondError;
      },
      step: () => true,
    });
    harness.targets.set('first', first);
    harness.targets.set('second', second);
    harness.coordinator.wake('first', first);
    harness.coordinator.wake('second', second);

    expect(() => harness.frames.flushNext()).toThrow(firstError);

    expect(first.publish).toHaveBeenCalledOnce();
    expect(second.publish).toHaveBeenCalledOnce();
    expect(harness.renderMaterials).toHaveBeenCalledOnce();
    expect(harness.frames.frames.size).toBe(0);
  });

  it('stops after an owner-destroying listener and still throws its error', () => {
    const harness = createHarness();
    const listenerError = new Error('listener destroyed owner');
    const first = createTarget({
      publish: () => {
        harness.setDestroyed(true);
        throw listenerError;
      },
      step: () => true,
    });
    const second = createTarget({ step: () => true });
    harness.targets.set('first', first);
    harness.targets.set('second', second);
    harness.coordinator.wake('first', first);
    harness.coordinator.wake('second', second);

    expect(() => harness.frames.flushNext()).toThrow(listenerError);

    expect(first.publish).toHaveBeenCalledOnce();
    expect(second.step).not.toHaveBeenCalled();
    expect(harness.renderMaterials).not.toHaveBeenCalled();
    expect(harness.frames.frames.size).toBe(0);
  });

  it('retains a render request made by the render callback', () => {
    let renderCalls = 0;
    const harness = createHarness(() => {
      renderCalls += 1;
      if (renderCalls === 1) harness.coordinator.requestRender();
    });
    harness.coordinator.requestRender();

    harness.frames.flushNext();

    expect(harness.renderMaterials).toHaveBeenCalledOnce();
    expect(harness.frames.frames.size).toBe(1);
    harness.frames.flushNext(32);
    expect(harness.renderMaterials).toHaveBeenCalledTimes(2);
    expect(harness.frames.frames.size).toBe(0);
  });

  it('preserves first-error priority and rearms after later render failure', () => {
    const renderError = new Error('render failed');
    const harness = createHarness(() => {
      throw renderError;
    });
    const publishError = new Error('publish failed');
    const target = createTarget({
      isMotionAtRest: () => false,
      publish: () => {
        throw publishError;
      },
      step: () => true,
    });
    harness.targets.set('material', target);
    harness.coordinator.wake('material', target);

    expect(() => harness.frames.flushNext()).toThrow(publishError);
    expect(harness.frames.frames.size).toBe(1);
  });

  it('rejects stale targets and removes targets missing during a frame', () => {
    const harness = createHarness();
    const stale = createTarget();
    const current = createTarget();
    harness.targets.set('material', current);

    harness.coordinator.wake('material', stale);
    expect(stale.resetTimestamp).not.toHaveBeenCalled();
    expect(harness.frames.frames.size).toBe(0);

    harness.coordinator.wake('material', current);
    harness.targets.delete('material');
    harness.frames.flushNext();
    expect(current.step).not.toHaveBeenCalled();
    expect(harness.frames.frames.size).toBe(0);
  });

  it('does not let a cancelled stale callback consume a newer frame', () => {
    const harness = createHarness();
    const stale = createTarget();
    const current = createTarget();
    harness.targets.set('material', stale);
    harness.coordinator.wake('material', stale);
    const frameId = [...harness.frames.frames.keys()][0];
    if (frameId === undefined) throw new Error('Missing scheduled frame.');

    harness.coordinator.cancelWhenIdle();
    expect(harness.frames.cancelled).toHaveLength(0);
    harness.coordinator.deactivate('material');
    harness.coordinator.cancelWhenIdle();
    expect(harness.frames.cancelled).toEqual([frameId]);

    harness.targets.set('material', current);
    harness.coordinator.wake('material', current);
    harness.frames.invoke(frameId);
    expect(stale.step).not.toHaveBeenCalled();
    expect(current.step).not.toHaveBeenCalled();
    expect(harness.frames.frames.size).toBe(1);

    harness.frames.flushNext(32);
    expect(current.step).toHaveBeenCalledOnce();
  });

  it('cancels all state on destroy and ignores later work', () => {
    const harness = createHarness();
    const target = createTarget();
    harness.targets.set('material', target);
    harness.coordinator.wake('material', target);
    const frameId = [...harness.frames.frames.keys()][0];
    if (frameId === undefined) throw new Error('Missing scheduled frame.');

    harness.coordinator.destroy();
    harness.coordinator.wake('material', target);
    harness.coordinator.requestRender();
    harness.frames.invoke(frameId);

    expect(harness.frames.cancelled).toEqual([frameId]);
    expect(target.step).not.toHaveBeenCalled();
    expect(harness.renderMaterials).not.toHaveBeenCalled();
  });
});
