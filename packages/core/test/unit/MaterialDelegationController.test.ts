import { describe, expect, it, vi } from 'vitest';

import { snapshotMaterialConfig } from '../../src/engine/material-config';
import { MaterialDelegationController } from '../../src/engine/MaterialDelegationController';
import { createMaterialRegistration } from '../../src/engine/registrations';
import { GlassError } from '../../src/errors/GlassError';
import { InteractionEngine } from '../../src/interaction';
import type {
  ExternalMaterialConfig,
  ExternalMaterialFeedback,
  ExternalMaterialHandle,
  MaterialPresentationState,
  ProxyTargetInterface,
} from '../../src/types';
import {
  createRuntimeHarness,
  FakeElement,
} from '../fixtures/glass-context-rendering';

interface TargetRegistration {
  readonly config: ExternalMaterialConfig;
  readonly updates: Partial<ExternalMaterialConfig>[];
  readonly handle: ExternalMaterialHandle;
  emit(feedback: ExternalMaterialFeedback): void;
  failUpdates(): void;
}

function createTarget(name: string) {
  const registrations: TargetRegistration[] = [];
  const registerExternalMaterial = vi.fn((config: ExternalMaterialConfig) => {
    let destroyed = false;
    let updateFailure = false;
    let listener: ((feedback: ExternalMaterialFeedback) => void) | null = null;
    const updates: Partial<ExternalMaterialConfig>[] = [];
    const handle: ExternalMaterialHandle = {
      id: `${name}-${registrations.length + 1}`,
      get destroyed() {
        return destroyed;
      },
      destroy: () => {
        destroyed = true;
        listener = null;
      },
      onFeedback: (callback) => {
        listener = callback;
        return () => {
          if (listener === callback) listener = null;
        };
      },
      update: (changes) => {
        if (updateFailure) throw new Error(`${name} update failed`);
        updates.push(changes);
      },
    };
    const registration: TargetRegistration = {
      config,
      updates,
      handle,
      emit: (feedback) => listener?.(feedback),
      failUpdates: () => {
        updateFailure = true;
      },
    };
    registrations.push(registration);
    return handle;
  });
  const proxy: ProxyTargetInterface = {
    getContainerRect: () => null,
    getScrollPosition: () => ({ x: 0, y: 0 }),
    registerExternalMaterial,
  };
  return { proxy, registerExternalMaterial, registrations };
}

function presentation(): MaterialPresentationState {
  const engine = new InteractionEngine('button');
  const snapshot = {
    blurred: false,
    fallbackMode: false,
    interactionConfig: engine.getConfig(),
    interactionOutput: engine.getOutput(),
    themeColorMode: 'light' as const,
  };
  engine.destroy();
  return snapshot;
}

function createHarness() {
  const runtime = createRuntimeHarness();
  const feedback = vi.fn();
  const onError = vi.fn<(error: GlassError) => void>();
  const requestRender = vi.fn();
  const controller = new MaterialDelegationController(runtime.runtime, {
    onError,
    onFeedback: feedback,
    requestRender,
  });
  return {
    controller,
    feedback,
    onError,
    requestRender,
    runtime,
  };
}

describe('MaterialDelegationController', () => {
  it('switches targets, synchronizes layout, returns feedback, and clears state', () => {
    const harness = createHarness();
    const first = createTarget('first');
    const second = createTarget('second');
    const element = new FakeElement({ x: 30, y: 40, width: 100, height: 50 });
    const registration = createMaterialRegistration({
      element: element as unknown as HTMLElement,
      proxyTarget: first.proxy,
      radius: 12,
    });
    const currentPresentation = presentation();

    harness.controller.track(registration, () => currentPresentation);

    expect(first.registerExternalMaterial).toHaveBeenCalledTimes(1);
    expect(harness.controller.isDelegated(registration)).toBe(true);
    expect(harness.controller.getDiagnosticsState()).toEqual({
      activeMaterials: 1,
      frames: {
        pendingAnimationFrame: true,
        pendingTimer: false,
      },
    });
    first.registrations[0]?.emit({
      themeColorMode: 'dark',
      averageLuminance: 60,
    });
    expect(harness.feedback).toHaveBeenCalledWith(registration, {
      themeColorMode: 'dark',
      averageLuminance: 60,
    });

    element.setClientRect({ x: 31, y: 41, width: 100, height: 50 });
    harness.runtime.flushFrame();
    expect(first.registrations[0]?.updates.at(-1)).toEqual({
      clientRect: { x: 31, y: 41, width: 100, height: 50 },
      transform: {
        scaleX: 1,
        scaleY: 1,
        translateX: 0,
        translateY: 0,
      },
    });
    expect(harness.runtime.frames.size).toBe(1);

    registration.config = snapshotMaterialConfig({
      ...registration.config,
      blur: 8,
    });
    harness.controller.sync(registration, () => currentPresentation);
    expect(first.registrations[0]?.updates.at(-1)).toMatchObject({ blur: 8 });

    registration.config = snapshotMaterialConfig({
      ...registration.config,
      proxyTarget: second.proxy,
    });
    harness.controller.sync(registration, () => currentPresentation);
    expect(first.registrations[0]?.handle.destroyed).toBe(true);
    expect(second.registerExternalMaterial).toHaveBeenCalledTimes(1);

    registration.config = snapshotMaterialConfig({
      ...registration.config,
      proxyTarget: undefined,
    });
    harness.controller.sync(registration, () => currentPresentation);
    expect(second.registrations[0]?.handle.destroyed).toBe(true);
    expect(harness.controller.isDelegated(registration)).toBe(false);
    expect(harness.runtime.frames.size).toBe(0);

    harness.controller.destroy();
    harness.controller.destroy();
  });

  it('falls back to source rendering and reports one failed background sync', () => {
    const harness = createHarness();
    const target = createTarget('failing');
    const element = new FakeElement({ x: 10, y: 20, width: 80, height: 40 });
    const registration = createMaterialRegistration({
      element: element as unknown as HTMLElement,
      proxyTarget: target.proxy,
    });
    const currentPresentation = presentation();
    harness.controller.track(registration, () => currentPresentation);
    target.registrations[0]?.failUpdates();
    element.setClientRect({ x: 20, y: 30, width: 80, height: 40 });

    harness.runtime.flushFrame();

    expect(target.registrations[0]?.handle.destroyed).toBe(true);
    expect(harness.controller.isDelegated(registration)).toBe(false);
    expect(harness.requestRender).toHaveBeenCalledTimes(1);
    expect(harness.onError).toHaveBeenCalledTimes(1);
    expect(harness.onError.mock.calls[0]?.[0]).toMatchObject({
      code: 'LIFECYCLE_FAILED',
    });
    expect(harness.runtime.frames.size).toBe(0);
  });

  it('rejects malformed handles without retaining scheduler ownership', () => {
    const harness = createHarness();
    const invalidTarget: ProxyTargetInterface = {
      getContainerRect: () => null,
      getScrollPosition: () => ({ x: 0, y: 0 }),
      registerExternalMaterial: () => (
        {} as ExternalMaterialHandle
      ),
    };
    const registration = createMaterialRegistration({
      element: new FakeElement({
        x: 0,
        y: 0,
        width: 40,
        height: 20,
      }) as unknown as HTMLElement,
      proxyTarget: invalidTarget,
    });

    expect(() => harness.controller.track(registration, presentation))
      .toThrowError(expect.objectContaining<Partial<GlassError>>({
        code: 'LIFECYCLE_FAILED',
      }));
    expect(harness.controller.getDiagnosticsState().activeMaterials).toBe(0);
    expect(harness.runtime.frames.size).toBe(0);
  });
});
