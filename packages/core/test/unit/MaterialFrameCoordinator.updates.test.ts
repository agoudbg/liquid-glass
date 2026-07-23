import { describe, expect, it, vi } from 'vitest';

import {
  MaterialFrameCoordinator,
  type MaterialFrameTarget,
} from '../../src/engine/MaterialFrameCoordinator';
import type { GlassEngineRuntime } from '../../src/engine/runtime';
import type { MaterialChanges } from '../../src/types';

interface HarnessState {
  destroyed: boolean;
  published: Array<readonly [string, MaterialChanges]>;
  publishHook(materialId: string): void;
  renderCalls: number;
  renderHook(): void;
  requestCalls: number;
  requestHook(requestNumber: number): void;
}

interface UpdateHarness {
  coordinator: MaterialFrameCoordinator;
  frames: Map<number, FrameRequestCallback>;
  state: HarnessState;
  targets: Map<string, MaterialFrameTarget>;
  flush(timestamp?: number): void;
}

function createHarness(): UpdateHarness {
  const frames = new Map<number, FrameRequestCallback>();
  const targets = new Map<string, MaterialFrameTarget>();
  const state: HarnessState = {
    destroyed: false,
    published: [],
    publishHook: () => undefined,
    renderCalls: 0,
    renderHook: () => undefined,
    requestCalls: 0,
    requestHook: () => undefined,
  };
  let nextFrameId = 0;
  const runtime: GlassEngineRuntime = {
    cancelAnimationFrame: (frameId) => frames.delete(frameId),
    createCanvas: () => ({}) as HTMLCanvasElement,
    devicePixelRatio: () => 1,
    getComputedStyle: () => ({}) as CSSStyleDeclaration,
    requestAnimationFrame: (callback) => {
      state.requestCalls += 1;
      state.requestHook(state.requestCalls);
      nextFrameId += 1;
      frames.set(nextFrameId, callback);
      return nextFrameId;
    },
  };
  const coordinator = new MaterialFrameCoordinator(runtime, {
    getTarget: (materialId) => targets.get(materialId) ?? null,
    isDestroyed: () => state.destroyed,
    publishUpdate: (materialId, changes) => {
      state.published.push([materialId, changes]);
      state.publishHook(materialId);
    },
    renderMaterials: () => {
      state.renderCalls += 1;
      state.renderHook();
    },
  });

  return {
    coordinator,
    frames,
    state,
    targets,
    flush: (timestamp = 16) => {
      const frame = frames.entries().next().value as
        | readonly [number, FrameRequestCallback]
        | undefined;
      if (!frame) throw new Error('No frame is pending.');
      frames.delete(frame[0]);
      frame[1](timestamp);
    },
  };
}

function createTarget(
  overrides: Partial<MaterialFrameTarget> = {},
): MaterialFrameTarget {
  return {
    isMotionAtRest: vi.fn(() => true),
    publish: vi.fn(),
    resetTimestamp: vi.fn(),
    step: vi.fn(() => false),
    ...overrides,
  };
}

describe('MaterialFrameCoordinator update batching', () => {
  it('merges out-of-order commits by field revision and first dirtiness', () => {
    const harness = createHarness();
    harness.coordinator.queueUpdate('first', {
      interactionConfig: undefined,
      radius: 14,
    }, 3);
    harness.coordinator.queueUpdate('second', { blur: 2 }, 2);
    harness.coordinator.queueUpdate('first', {
      dispersion: 1,
      interactionConfig: { hoverFollowFactor: 0.5 },
      radius: 13,
    }, 1);

    harness.flush();

    expect(harness.state.published).toEqual([
      ['first', { dispersion: 1, interactionConfig: undefined, radius: 14 }],
      ['second', { blur: 2 }],
    ]);
    expect(Object.prototype.hasOwnProperty.call(
      harness.state.published[0]?.[1] ?? {},
      'interactionConfig',
    )).toBe(true);
    expect(harness.state.renderCalls).toBe(1);
  });

  it('defers reentrant updates and completes every frame phase before throwing', () => {
    const harness = createHarness();
    const updateError = new Error('update listener failed');
    const presentationError = new Error('presentation listener failed');
    const target = createTarget({
      isMotionAtRest: vi.fn(() => false),
      publish: vi.fn(() => {
        throw presentationError;
      }),
      step: vi.fn(() => true),
    });
    harness.targets.set('animated', target);
    harness.state.publishHook = (materialId) => {
      if (materialId !== 'first') return;
      harness.coordinator.queueUpdate('reentrant', { blur: 3 }, 3);
      throw updateError;
    };
    harness.state.renderHook = () => {
      throw new Error('render failed');
    };
    harness.coordinator.queueUpdate('first', { radius: 13 }, 1);
    harness.coordinator.queueUpdate('second', { radius: 14 }, 2);
    harness.coordinator.wake('animated', target);

    expect(() => harness.flush()).toThrow(updateError);

    expect(harness.state.published.map(([id]) => id)).toEqual([
      'first',
      'second',
    ]);
    expect(target.publish).toHaveBeenCalledOnce();
    expect(harness.state.renderCalls).toBe(1);
    expect(harness.frames.size).toBe(1);
    harness.coordinator.destroy();
  });

  it('keeps updates on deactivate but drops retired work', () => {
    const harness = createHarness();
    harness.coordinator.queueUpdate('offscreen', { radius: 13 }, 1);
    harness.coordinator.deactivate('offscreen');
    harness.coordinator.queueUpdate('retired', { radius: 14 }, 2);
    harness.coordinator.retire('retired');

    harness.flush();

    expect(harness.state.published).toEqual([
      ['offscreen', { radius: 13 }],
    ]);

    harness.coordinator.queueUpdate('removed-before-frame', { blur: 2 }, 3);
    harness.coordinator.retire('removed-before-frame');
    harness.coordinator.cancelWhenIdle();
    expect(harness.frames.size).toBe(0);
  });

  it('tombstones retired identifiers in the detached current batch', () => {
    const harness = createHarness();
    harness.state.publishHook = (materialId) => {
      if (materialId !== 'first') return;
      harness.coordinator.retire('first');
      harness.coordinator.retire('second');
    };
    harness.coordinator.queueUpdate('first', { radius: 13 }, 1);
    harness.coordinator.queueUpdate('second', { radius: 14 }, 2);

    harness.flush();

    expect(harness.state.published).toEqual([
      ['first', { radius: 13 }],
    ]);
    expect(harness.state.renderCalls).toBe(0);
  });

  it('emits a reentrant covered update without drawing it twice', () => {
    const harness = createHarness();
    harness.state.publishHook = () => {
      if (harness.state.published.length !== 1) return;
      harness.coordinator.queueUpdate('material', { radius: 14 }, 2);
    };
    harness.coordinator.queueUpdate('material', { radius: 13 }, 1);

    harness.flush();
    expect(harness.frames.size).toBe(1);
    harness.flush(32);

    expect(harness.state.published).toEqual([
      ['material', { radius: 13 }],
      ['material', { radius: 14 }],
    ]);
    expect(harness.state.renderCalls).toBe(1);
    expect(harness.frames.size).toBe(0);
  });

  it('shares one draw with explicit render and animation dirtiness', () => {
    const harness = createHarness();
    const target = createTarget({ step: vi.fn(() => true) });
    harness.targets.set('animated', target);
    harness.coordinator.queueUpdate('updated', { blur: 1 }, 1);
    harness.coordinator.requestRender();
    harness.coordinator.wake('animated', target);

    harness.flush();

    expect(harness.state.published).toHaveLength(1);
    expect(target.publish).toHaveBeenCalledOnce();
    expect(harness.state.renderCalls).toBe(1);
    expect(harness.frames.size).toBe(0);
  });

  it('consumes old immediate-draw dirtiness and preserves callback dirtiness', () => {
    const consumed = createHarness();
    consumed.coordinator.requestRender();
    consumed.coordinator.renderImmediately(0, () => undefined);
    consumed.coordinator.cancelWhenIdle();
    expect(consumed.frames.size).toBe(0);

    const retained = createHarness();
    retained.coordinator.requestRender();
    retained.coordinator.renderImmediately(0, () => {
      retained.coordinator.requestRender();
    });
    retained.coordinator.cancelWhenIdle();
    expect(retained.frames.size).toBe(1);
    retained.coordinator.destroy();

    const failed = createHarness();
    const renderError = new Error('immediate render failed');
    failed.coordinator.requestRender();
    expect(() => failed.coordinator.renderImmediately(0, () => {
      throw renderError;
    })).toThrow(renderError);
    failed.coordinator.cancelWhenIdle();
    expect(failed.frames.size).toBe(1);
    failed.coordinator.destroy();
  });

  it('aggregates rearm failures without replacing an earlier error', () => {
    const firstHarness = createHarness();
    const publishError = new Error('presentation listener failed');
    const rearmError = new Error('rearm failed');
    const firstTarget = createTarget({
      isMotionAtRest: vi.fn(() => false),
      publish: vi.fn(() => {
        throw publishError;
      }),
      step: vi.fn(() => true),
    });
    firstHarness.targets.set('animated', firstTarget);
    firstHarness.state.requestHook = (requestNumber) => {
      if (requestNumber === 2) throw rearmError;
    };
    firstHarness.coordinator.wake('animated', firstTarget);

    expect(() => firstHarness.flush()).toThrow(publishError);
    firstHarness.coordinator.destroy();

    const secondHarness = createHarness();
    const secondTarget = createTarget({
      isMotionAtRest: vi.fn(() => false),
    });
    secondHarness.targets.set('animated', secondTarget);
    secondHarness.state.requestHook = (requestNumber) => {
      if (requestNumber === 2) throw rearmError;
    };
    secondHarness.coordinator.wake('animated', secondTarget);

    expect(() => secondHarness.flush()).toThrow(rearmError);
    secondHarness.coordinator.requestRender();
    expect(secondHarness.frames.size).toBe(1);
    secondHarness.coordinator.destroy();
  });
});
