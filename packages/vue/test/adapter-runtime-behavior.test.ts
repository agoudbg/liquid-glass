import type { ProxyTargetInterface } from '@agou/liquid-glass-core';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick, shallowRef } from 'vue';

import LgBackdropCanvas from '../src/components/LgBackdropCanvas.vue';
import LiquidGlassMaterial from '../src/components/LiquidGlassMaterial.vue';
import { LIQUID_GLASS_CONTEXT_KEY } from '../src/composables/liquidGlassContext';
import {
  createBackdropHandle,
  createContextHarness,
  createMaterialHandle,
  createPresentation,
  dispatchPointer,
} from './fixtures/adapter-harness';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Vue adapter runtime behavior', () => {
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

  it('updates legacy and moveable behavior without replacing the material registration', async () => {
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
      props: { interaction: { baseScale: 0.93 }, isMoveable: true },
    });
    await nextTick();

    expect(harness.addMaterial).toHaveBeenCalledWith(expect.objectContaining({
      interactionConfig: expect.objectContaining({ baseScale: 0.93 }),
      isMoveable: true,
    }));

    await wrapper.setProps({ interaction: { baseScale: 0.96 }, isMoveable: false });
    await nextTick();

    expect(materialHandle.update).toHaveBeenLastCalledWith(expect.objectContaining({
      interactionConfig: expect.objectContaining({ baseScale: 0.96 }),
      isMoveable: false,
    }));
    expect(harness.addMaterial).toHaveBeenCalledTimes(1);
    expect(materialHandle.destroy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('preserves proxy target identity across reactive material updates', async () => {
    const firstTarget: ProxyTargetInterface = {
      getContainerRect: () => null,
      getScrollPosition: () => ({ x: 0, y: 0 }),
      registerExternalMaterial: () => {
        throw new Error('The adapter harness must not register proxy materials.');
      },
    };
    const secondTarget: ProxyTargetInterface = {
      ...firstTarget,
      getScrollPosition: () => ({ x: 4, y: 8 }),
    };
    const materialHandle = createMaterialHandle();
    const harness = createContextHarness(materialHandle);
    const wrapper = mount(LiquidGlassMaterial, {
      props: { proxyTarget: firstTarget },
      global: {
        provide: {
          [LIQUID_GLASS_CONTEXT_KEY as symbol]: {
            context: shallowRef(harness.context),
          },
        },
      },
    });
    await nextTick();

    expect(harness.addMaterial).toHaveBeenCalledWith(expect.objectContaining({
      proxyTarget: firstTarget,
    }));

    await wrapper.setProps({ proxyTarget: secondTarget });
    await nextTick();
    expect(materialHandle.update).toHaveBeenLastCalledWith(expect.objectContaining({
      proxyTarget: secondTarget,
    }));

    await wrapper.setProps({ proxyTarget: undefined });
    await nextTick();
    expect(materialHandle.update).toHaveBeenLastCalledWith(expect.objectContaining({
      proxyTarget: undefined,
    }));
    expect(harness.addMaterial).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    expect(materialHandle.destroy).toHaveBeenCalledTimes(1);
  });

  it('emits background changes only when the sampled theme mode changes', async () => {
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

    expect(wrapper.emitted('backgroundColorChange')).toBeUndefined();
    materialHandle.emitPresentation(createPresentation({ blurred: true }));
    expect(wrapper.emitted('backgroundColorChange')).toBeUndefined();
    materialHandle.emitPresentation(createPresentation({ themeColorMode: 'dark' }));
    materialHandle.emitPresentation(createPresentation({
      blurred: true,
      themeColorMode: 'dark',
    }));
    materialHandle.emitPresentation(createPresentation({
      themeColorMode: 'ultra_light',
    }));

    expect(wrapper.emitted('backgroundColorChange')).toEqual([
      ['dark'],
      ['ultra_light'],
    ]);
    wrapper.unmount();
    expect(materialHandle.presentationUnsubscribed).toHaveBeenCalledTimes(2);
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
    expect(materialHandle.presentationUnsubscribed).toHaveBeenCalledTimes(2);
  });
});
