import type {
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  GlassContext,
  GlassEngine,
  MaterialHandle,
  MaterialPresentationState,
} from '@agou/liquid-glass-core';
import { InteractionEngine } from '@agou/liquid-glass-core';
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

interface TestMaterialHandle extends MaterialHandle {
  emitPresentation(presentation: MaterialPresentationState): void;
  presentationUnsubscribed: ReturnType<typeof vi.fn>;
}

function createPresentation(
  overrides: Partial<MaterialPresentationState> = {},
): MaterialPresentationState {
  const engine = new InteractionEngine('button');
  return {
    blurred: false,
    fallbackMode: false,
    interactionConfig: engine.getConfig(),
    interactionOutput: engine.getOutput(),
    themeColorMode: 'light',
    ...overrides,
  };
}

function dispatchPointer(
  target: EventTarget,
  type: string,
  overrides: Partial<Pick<
    PointerEvent,
    'clientX' | 'clientY' | 'pointerId' | 'pointerType' | 'pressure'
  >> = {},
): void {
  const event = new Event(type, { bubbles: true, composed: true });
  const pointer = {
    clientX: 24,
    clientY: 18,
    pointerId: 7,
    pointerType: 'mouse',
    pressure: 0.5,
    ...overrides,
  };
  for (const [property, value] of Object.entries(pointer)) {
    Object.defineProperty(event, property, { configurable: true, value });
  }
  target.dispatchEvent(event);
}

function createMaterialHandle(id = 'material-1'): TestMaterialHandle {
  let currentPresentation = createPresentation();
  const listeners = new Set<(presentation: MaterialPresentationState) => void>();
  const presentationUnsubscribed = vi.fn();
  const handle: TestMaterialHandle = {
    id,
    destroyed: false,
    destroy: vi.fn(),
    emitPresentation: (presentation) => {
      currentPresentation = presentation;
      for (const listener of [...listeners]) listener(presentation);
    },
    getPresentation: vi.fn(() => currentPresentation),
    onPresentation: vi.fn((listener) => {
      listeners.add(listener);
      listener(currentPresentation);
      return () => {
        listeners.delete(listener);
        presentationUnsubscribed();
      };
    }),
    presentationUnsubscribed,
    refreshLayout: vi.fn(),
    setInteractionState: vi.fn(),
    update: vi.fn(),
  };
  return handle;
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

  it('updates moveable behavior without replacing the material registration', async () => {
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
      props: { isMoveable: true },
    });
    await nextTick();

    expect(harness.addMaterial).toHaveBeenCalledWith(expect.objectContaining({
      isMoveable: true,
    }));

    await wrapper.setProps({ isMoveable: false });
    await nextTick();

    expect(materialHandle.update).toHaveBeenLastCalledWith(expect.objectContaining({
      isMoveable: false,
    }));
    expect(harness.addMaterial).toHaveBeenCalledTimes(1);
    expect(materialHandle.destroy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('bridges pointer input and applies presentation snapshots without consuming child events', async () => {
    const materialHandle = createMaterialHandle();
    const harness = createContextHarness(materialHandle);
    const onChildClick = vi.fn();
    const onPointerdown = vi.fn();
    const wrapper = mount(LiquidGlassMaterial, {
      attrs: { onPointerdown },
      props: {
        illuminationAngle: 90,
        illuminationIntensity: 0.8,
        thickness: 14,
      },
      slots: {
        default: () => h('button', { onClick: onChildClick }, 'Action'),
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

    const material = wrapper.get('.liquid-glass-material').element as HTMLElement;
    const child = wrapper.get('button').element;
    const setPointerCapture = vi.fn();
    Object.defineProperty(material, 'setPointerCapture', {
      configurable: true,
      value: setPointerCapture,
    });

    expect(material.style.getPropertyValue('--lg-background-tint')).toBe('#ffffff99');
    expect(material.style.getPropertyValue('--lg-inset-shadow-size')).toBe('14px');
    dispatchPointer(child, 'pointerdown');
    expect(onPointerdown).toHaveBeenCalledTimes(1);
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(materialHandle.setInteractionState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pointerState: expect.objectContaining({ isActive: true, pointerId: 7 }),
      }),
    );

    dispatchPointer(document.body, 'pointerup');
    expect(materialHandle.setInteractionState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pointerState: expect.objectContaining({ isActive: false, pointerId: 7 }),
      }),
    );
    child.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onChildClick).toHaveBeenCalledTimes(1);

    const base = createPresentation();
    materialHandle.emitPresentation({
      ...base,
      blurred: true,
      interactionOutput: {
        ...base.interactionOutput,
        highlightVisible: true,
        highlightX: 0.2,
        highlightY: 0.7,
        scaleX: 1.1,
        translateX: 12,
      },
    });
    expect(material.style.getPropertyValue('--lg-scale-x')).toBe('1.1');
    expect(material.style.getPropertyValue('--lg-translate-x')).toBe('12px');
    expect(material.getAttribute('is-blurred')).toBe('true');
    expect(wrapper.get('.liquid-glass-highlight').classes()).toContain('visible');

    wrapper.unmount();
    expect(materialHandle.presentationUnsubscribed).toHaveBeenCalledTimes(1);
  });
});
