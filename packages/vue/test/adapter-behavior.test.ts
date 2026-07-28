import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defineComponent,
  h,
  nextTick,
  onErrorCaptured,
} from 'vue';

import LiquidGlass from '../src/components/LiquidGlass.vue';
import LiquidGlassMaterial from '../src/components/LiquidGlassMaterial.vue';
import {
  createContextHarness,
  createEngine,
  createMaterialHandle,
} from './fixtures/adapter-harness';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Vue adapter behavior', () => {
  it('renders a direct scrollable content layer for core ownership', async () => {
    const harness = createContextHarness();
    const engine = createEngine(harness.context);
    const wrapper = mount(LiquidGlass, {
      props: {
        engine: engine.engine,
        options: { scrollable: true },
      },
      slots: {
        default: () => h('span', { 'data-testid': 'content' }, 'Content'),
      },
    });

    await nextTick();

    const container = wrapper.get('.liquid-glass-container').element;
    const content = container.querySelector(
      ':scope > .liquid-glass-content.scrollable',
    );
    expect(content).not.toBeNull();
    expect(content?.querySelector('[data-testid="content"]')).not.toBeNull();
    expect(engine.createContext.mock.calls[0]?.[0]).toBe(container);
    wrapper.unmount();
  });

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
        default: () => h(
          LiquidGlassMaterial,
          { radius: 18 },
          { default: () => 'Glass content' },
        ),
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
    const material = wrapper.get('.liquid-glass-material');
    expect(material.element.querySelector(
      ':scope > .liquid-glass-content',
    )).toBeNull();
    expect(material.text()).toContain('Glass content');

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

});
