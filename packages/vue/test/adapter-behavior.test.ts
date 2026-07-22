import type {
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  GlassContext,
  GlassEngine,
  MaterialHandle,
} from '@agou/liquid-glass-core';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defineComponent,
  h,
  nextTick,
  onErrorCaptured,
  shallowRef,
} from 'vue';

import LgBackdropCanvas from '../src/components/LgBackdropCanvas.vue';
import LiquidGlass from '../src/components/LiquidGlass.vue';
import LiquidGlassMaterial from '../src/components/LiquidGlassMaterial.vue';
import { LIQUID_GLASS_CONTEXT_KEY } from '../src/composables/liquidGlassContext';

interface ContextHarness {
  context: GlassContext;
  addBackdropSource: ReturnType<typeof vi.fn>;
  addMaterial: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  updateOptions: ReturnType<typeof vi.fn>;
}

function createMaterialHandle(id = 'material-1'): MaterialHandle {
  return {
    id,
    destroyed: false,
    destroy: vi.fn(),
    refreshLayout: vi.fn(),
    setInteractionState: vi.fn(),
    update: vi.fn(),
  };
}

function createBackdropHandle(
  id = 'backdrop-1',
): BackdropSourceHandle<CanvasBackdropSourceConfig> {
  return {
    id,
    destroyed: false,
    destroy: vi.fn(),
    refresh: vi.fn(),
    update: vi.fn(),
  };
}

function createContextHarness(
  materialHandle = createMaterialHandle(),
  backdropHandle = createBackdropHandle(),
): ContextHarness {
  const addBackdropSource = vi.fn(() => backdropHandle);
  const addMaterial = vi.fn(() => materialHandle);
  const destroy = vi.fn();
  const updateOptions = vi.fn();
  const context = {
    addBackdropSource,
    addMaterial,
    canvas: document.createElement('canvas'),
    createProxyInterface: vi.fn(() => null),
    destroy,
    off: vi.fn(),
    on: vi.fn(() => vi.fn()),
    refresh: vi.fn(),
    setFallbackMode: vi.fn(),
    setViewportMode: vi.fn(),
    updateOptions,
  } as unknown as GlassContext;

  return {
    context,
    addBackdropSource,
    addMaterial,
    destroy,
    updateOptions,
  };
}

function createEngine(context: GlassContext): {
  engine: GlassEngine;
  createContext: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  const createContext = vi.fn(() => context);
  const destroy = vi.fn();
  const engine = {
    createContext,
    destroy,
    destroyed: false,
  } as unknown as GlassEngine;

  return { engine, createContext, destroy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Vue adapter behavior', () => {
  it('preserves boolean values supplied through the options object', async () => {
    const harness = createContextHarness();
    const engine = createEngine(harness.context);
    const wrapper = mount(LiquidGlass, {
      props: {
        engine: engine.engine,
        options: {
          debug: true,
          enableBlurredEffect: true,
          scrollable: true,
        },
      },
    });

    await nextTick();

    expect(engine.createContext).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        debug: true,
        enableBlurredEffect: true,
        scrollable: true,
      }),
    );

    wrapper.unmount();
  });

  it('maps legacy container props over options before creating the context', async () => {
    const harness = createContextHarness();
    const engine = createEngine(harness.context);
    const legacyThemeThresholds = {
      darkMax: 82,
      ultraDarkMax: 24,
      ultraLightMin: 232,
    };
    const wrapper = mount(LiquidGlass, {
      props: {
        debug: true,
        engine: engine.engine,
        options: {
          canvasZIndex: 40,
          debug: false,
          enableFallback: true,
          renderMode: 'dedicated',
          renderPrecision: 0.25,
          scrollable: false,
          themeColorThresholds: {
            darkMax: 10,
            ultraDarkMax: 5,
            ultraLightMin: 250,
          },
        },
        renderMode: 'uniform',
        renderPrecision: 0.75,
        scrollable: true,
        themeColorThresholds: legacyThemeThresholds,
        zIndex: 120,
      },
    });

    await nextTick();

    expect(engine.createContext).toHaveBeenCalledTimes(1);
    expect(engine.createContext).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        canvasZIndex: 119,
        debug: true,
        enableFallback: true,
        renderMode: 'uniform',
        renderPrecision: 0.75,
        scrollable: true,
        themeColorThresholds: legacyThemeThresholds,
      }),
    );

    wrapper.unmount();
  });

  it('mounts, updates options in place, preserves the material registration, and unmounts', async () => {
    const materialHandle = createMaterialHandle();
    const initialRegistrationId = materialHandle.id;
    const harness = createContextHarness(materialHandle);
    const engine = createEngine(harness.context);
    const initialOptions = { renderPrecision: 1 };
    const updatedOptions = { renderPrecision: 0.5 };
    const wrapper = mount(LiquidGlass, {
      props: {
        engine: engine.engine,
        options: initialOptions,
      },
      slots: {
        default: () => h(LiquidGlassMaterial, { radius: 18 }),
      },
    });

    await nextTick();

    expect(engine.createContext).toHaveBeenCalledTimes(1);
    expect(engine.createContext).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining(initialOptions),
    );
    expect(harness.addMaterial).toHaveBeenCalledTimes(1);
    expect(materialHandle.id).toBe('material-1');

    await wrapper.setProps({ options: updatedOptions });
    await nextTick();

    expect(harness.updateOptions).toHaveBeenLastCalledWith(
      expect.objectContaining(updatedOptions),
    );
    expect(engine.createContext).toHaveBeenCalledTimes(1);
    expect(harness.addMaterial).toHaveBeenCalledTimes(1);
    expect(materialHandle.id).toBe(initialRegistrationId);
    expect(materialHandle.destroy).not.toHaveBeenCalled();

    wrapper.unmount();

    expect(materialHandle.destroy).toHaveBeenCalledTimes(1);
    expect(harness.destroy).toHaveBeenCalledTimes(1);
    expect(engine.destroy).not.toHaveBeenCalled();
  });

  it('does not report a ready-listener exception as a context creation error', async () => {
    const harness = createContextHarness();
    const engine = createEngine(harness.context);
    const readyError = new Error('ready listener failed');
    const onError = vi.fn();
    const capturedErrors: unknown[] = [];
    const ErrorBoundary = defineComponent({
      setup() {
        onErrorCaptured((error) => {
          capturedErrors.push(error);
          return false;
        });
        return () => h(LiquidGlass, {
          engine: engine.engine,
          onError,
          onReady: () => {
            throw readyError;
          },
        });
      },
    });
    const wrapper = mount(ErrorBoundary);

    await nextTick();

    expect(engine.createContext).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(capturedErrors).toEqual([readyError]);

    wrapper.unmount();
  });

  it('updates a backdrop registration without requesting a redundant refresh', async () => {
    const backdropHandle = createBackdropHandle();
    const harness = createContextHarness(createMaterialHandle(), backdropHandle);
    const initialDraw = vi.fn();
    const updatedDraw = vi.fn();
    const wrapper = mount(LgBackdropCanvas, {
      props: {
        draw: initialDraw,
        zIndex: 1,
      },
      global: {
        provide: {
          [LIQUID_GLASS_CONTEXT_KEY as symbol]: {
            context: shallowRef(harness.context),
          },
        },
      },
    });

    await nextTick();
    expect(harness.addBackdropSource).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ draw: updatedDraw, zIndex: 2 });
    await nextTick();

    expect(backdropHandle.update).toHaveBeenCalledTimes(1);
    expect(backdropHandle.update).toHaveBeenCalledWith({
      draw: updatedDraw,
      zIndex: 2,
    });
    expect(backdropHandle.refresh).not.toHaveBeenCalled();
    expect(harness.addBackdropSource).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    expect(backdropHandle.destroy).toHaveBeenCalledTimes(1);
  });

  it('preserves blur input while exposing the bounded CSS fallback value', async () => {
    const materialHandle = createMaterialHandle();
    const harness = createContextHarness(materialHandle);
    const wrapper = mount(LiquidGlassMaterial, {
      global: {
        provide: {
          [LIQUID_GLASS_CONTEXT_KEY as symbol]: {
            context: shallowRef(harness.context),
          },
        },
      },
    });
    await nextTick();

    const material = wrapper.get('.liquid-glass-material').element as HTMLElement;
    expect(material.style.getPropertyValue('--lg-fallback-blur')).toBe('6px');
    expect(harness.addMaterial).toHaveBeenCalledWith(expect.objectContaining({
      blur: undefined,
    }));

    await wrapper.setProps({ blur: 0 });
    expect(material.style.getPropertyValue('--lg-fallback-blur')).toBe('0px');
    expect(materialHandle.update).toHaveBeenLastCalledWith(expect.objectContaining({
      blur: 0,
    }));

    await wrapper.setProps({ blur: 9 });
    expect(material.style.getPropertyValue('--lg-fallback-blur')).toBe('6px');
    wrapper.unmount();
  });
});
