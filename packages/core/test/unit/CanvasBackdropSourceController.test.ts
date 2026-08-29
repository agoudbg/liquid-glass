import { describe, expect, it, vi } from 'vitest';

import { CanvasBackdropSourceController } from '../../src/engine/CanvasBackdropSourceController';
import type {
  BackdropRegistration,
  CanvasBackdropRegistration,
} from '../../src/engine/registrations';
import type { GlassEngineRuntime } from '../../src/engine/runtime';
import { FakeCanvas } from '../fixtures/fake-webgl2';

function createCanvas(): HTMLCanvasElement {
  const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
  canvas.getBoundingClientRect = () => ({
    bottom: 180,
    height: 180,
    left: 0,
    right: 320,
    top: 0,
    width: 320,
    x: 0,
    y: 0,
  } as DOMRect);
  return canvas;
}

function createRuntime(): GlassEngineRuntime {
  return {
    createCanvas,
    devicePixelRatio: () => 1,
    getComputedStyle: () => ({}) as CSSStyleDeclaration,
  };
}

describe('CanvasBackdropSourceController', () => {
  it('restores the previous configuration when observer rebinding fails', () => {
    const sources = new Map<string, BackdropRegistration>();
    const updateFailure = new Error('observer update failed');
    const sourceUpdated = vi.fn()
      .mockImplementationOnce(() => {
        throw updateFailure;
      })
      .mockImplementationOnce(() => undefined);
    let registration: CanvasBackdropRegistration | undefined;
    const controller = new CanvasBackdropSourceController(
      sources,
      createRuntime(),
      {
        assertRegistration: () => undefined,
        requestComposite: vi.fn(),
        sourceAdded: (value) => {
          registration = value;
        },
        sourceRemoved: vi.fn(),
        sourceUpdated,
      },
    );
    const handle = controller.add({
      kind: 'canvas',
      draw: () => undefined,
      element: createCanvas(),
      zIndex: 1,
    });

    expect(() => handle.update({ zIndex: 2 })).toThrow(updateFailure);
    expect(registration?.config.zIndex).toBe(1);
    expect(sourceUpdated).toHaveBeenCalledTimes(2);
    expect(sourceUpdated.mock.calls[1]?.[0].config.zIndex).toBe(1);
  });

  it('preserves the operation failure while completing add rollback', () => {
    const sources = new Map<string, BackdropRegistration>();
    const operationFailure = new Error('composite failed');
    const cleanupFailure = new Error('observer cleanup failed');
    let registration: CanvasBackdropRegistration | undefined;
    const controller = new CanvasBackdropSourceController(
      sources,
      createRuntime(),
      {
        assertRegistration: () => undefined,
        requestComposite: () => {
          throw operationFailure;
        },
        sourceAdded: (value) => {
          registration = value;
        },
        sourceRemoved: () => {
          throw cleanupFailure;
        },
        sourceUpdated: vi.fn(),
      },
    );

    expect(() => controller.add({
      kind: 'canvas',
      draw: () => undefined,
      element: createCanvas(),
    })).toThrow(operationFailure);
    expect(registration?.destroyed).toBe(true);
    expect(sources.size).toBe(0);
  });

  it('requests structural composition even when removal cleanup fails', () => {
    const sources = new Map<string, BackdropRegistration>();
    const cleanupFailure = new Error('observer cleanup failed');
    const requestComposite = vi.fn();
    const sourceRemoved = vi.fn(() => {
      throw cleanupFailure;
    });
    const controller = new CanvasBackdropSourceController(
      sources,
      createRuntime(),
      {
        assertRegistration: () => undefined,
        requestComposite,
        sourceAdded: vi.fn(),
        sourceRemoved,
        sourceUpdated: vi.fn(),
      },
    );
    const handle = controller.add({
      kind: 'canvas',
      draw: () => undefined,
      element: createCanvas(),
    });

    expect(() => handle.destroy()).toThrow(cleanupFailure);
    expect(handle.destroyed).toBe(true);
    expect(sources.size).toBe(0);
    expect(requestComposite).toHaveBeenNthCalledWith(2, 'structural');
  });
});
