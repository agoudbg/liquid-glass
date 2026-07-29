import { describe, expect, it, vi } from 'vitest';

import { ExternalMaterialController } from '../../src/engine/ExternalMaterialController';
import { externalMaterialConfig } from '../fixtures/external-material';
import { domRect } from '../fixtures/glass-context-rendering';

function createHarness() {
  let contextDestroyed = false;
  const containerRect = domRect({ x: 10, y: 20, width: 240, height: 140 });
  const container = {
    getBoundingClientRect: () => containerRect,
  } as HTMLElement;
  const content = {
    scrollLeft: 14,
    scrollTop: 9,
  } as HTMLElement;
  const renderImmediately = vi.fn();
  const requestRender = vi.fn();
  const controller = new ExternalMaterialController(
    container,
    content,
    {
      assertContextUsable: () => {
        if (contextDestroyed) throw new Error('destroyed');
      },
      isContextDestroyed: () => contextDestroyed,
      renderImmediately,
      requestRender,
    },
  );
  return {
    containerRect,
    controller,
    destroyContext: () => {
      contextDestroyed = true;
    },
    renderImmediately,
    requestRender,
  };
}

describe('ExternalMaterialController', () => {
  it('owns stable registration, update, feedback, and removal lifecycles', () => {
    const harness = createHarness();
    const proxy = harness.controller.getProxyInterface();
    expect(harness.controller.getProxyInterface()).toBe(proxy);
    expect(proxy.getContainerRect()).toBe(harness.containerRect);
    expect(proxy.getScrollPosition()).toEqual({ x: 14, y: 9 });

    const input = externalMaterialConfig();
    const handle = proxy.registerExternalMaterial(input);
    input.clientRect.x = 999;
    expect(harness.renderImmediately).toHaveBeenCalledTimes(1);
    expect(handle.destroyed).toBe(false);
    expect(harness.controller.getDiagnosticsState()).toEqual({
      materials: 1,
      materialsInViewport: 0,
    });

    const materials = harness.controller.resolveMaterials(
      harness.containerRect,
      { x: 14, y: 9 },
    );
    expect(materials).toHaveLength(1);
    expect(materials[0]?.rect.x).toBe(44);
    expect(harness.controller.getDiagnosticsState().materialsInViewport).toBe(1);

    handle.update({ blur: 8 });
    handle.update({ blur: 8 });
    expect(harness.requestRender).toHaveBeenCalledTimes(1);
    expect(harness.controller.resolveMaterials(
      harness.containerRect,
      { x: 0, y: 0 },
    )[0]?.blur).toBe(8);

    const feedback = vi.fn();
    const unsubscribe = handle.onFeedback(feedback);
    expect(harness.controller.publishFeedback(handle.id, {
      themeColorMode: 'dark',
      averageLuminance: 70,
    })).toBe(true);
    expect(feedback).toHaveBeenCalledWith({
      themeColorMode: 'dark',
      averageLuminance: 70,
    });
    unsubscribe();
    harness.controller.publishFeedback(handle.id, {
      themeColorMode: 'light',
      averageLuminance: 180,
    });
    expect(feedback).toHaveBeenCalledTimes(1);

    handle.destroy();
    handle.destroy();
    expect(handle.destroyed).toBe(true);
    expect(harness.renderImmediately).toHaveBeenCalledTimes(2);
    expect(harness.controller.getDiagnosticsState().materials).toBe(0);
  });

  it('replays the latest sample to feedback subscribers', () => {
    const harness = createHarness();
    const handle = harness.controller.getProxyInterface()
      .registerExternalMaterial(externalMaterialConfig());
    harness.controller.publishFeedback(handle.id, {
      themeColorMode: 'ultra_dark',
      averageLuminance: 12,
    });
    const feedback = vi.fn();

    handle.onFeedback(feedback);

    expect(feedback).toHaveBeenCalledWith({
      themeColorMode: 'ultra_dark',
      averageLuminance: 12,
    });
  });

  it('rolls back failed registration and rejects work after teardown starts', () => {
    const harness = createHarness();
    const failure = new Error('render failed');
    harness.renderImmediately.mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => harness.controller.getProxyInterface()
      .registerExternalMaterial(externalMaterialConfig())).toThrow(failure);
    expect(harness.controller.getDiagnosticsState().materials).toBe(0);

    harness.destroyContext();
    const proxy = harness.controller.getProxyInterface();
    expect(proxy.getContainerRect()).toBeNull();
    expect(proxy.getScrollPosition()).toEqual({ x: 0, y: 0 });
    expect(() => proxy.registerExternalMaterial(externalMaterialConfig()))
      .toThrow('destroyed');
  });

  it('releases every listener and registration on controller destruction', () => {
    const harness = createHarness();
    const handle = harness.controller.getProxyInterface()
      .registerExternalMaterial(externalMaterialConfig());
    const feedback = vi.fn();
    handle.onFeedback(feedback);

    harness.controller.destroy();
    harness.controller.destroy();

    expect(handle.destroyed).toBe(true);
    expect(harness.controller.getDiagnosticsState()).toEqual({
      materials: 0,
      materialsInViewport: 0,
    });
    expect(harness.controller.publishFeedback(handle.id, {
      themeColorMode: 'dark',
    })).toBe(false);
    expect(feedback).not.toHaveBeenCalled();
  });
});
