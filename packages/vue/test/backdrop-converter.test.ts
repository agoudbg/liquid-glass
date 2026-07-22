import type {
  BackdropSourceHandle,
  DomBackdropSourceConfig,
  GlassContext,
} from '@agou/liquid-glass-core';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick, shallowRef } from 'vue';

import LgBackdropConverter from '../src/components/LgBackdropConverter.vue';
import { LIQUID_GLASS_CONTEXT_KEY } from '../src/composables/liquidGlassContext';
import type {
  LgBackdropConverterExposed,
  LgBackdropConverterSlotProps,
} from '../src/types';

function createHarness() {
  let destroyed = false;
  const destroy = vi.fn<BackdropSourceHandle<DomBackdropSourceConfig>['destroy']>(() => {
    destroyed = true;
  });
  const handle: BackdropSourceHandle<DomBackdropSourceConfig> = {
    id: 'dom-backdrop-1',
    get destroyed() {
      return destroyed;
    },
    destroy,
    refresh: vi.fn(),
    update: vi.fn(),
  };
  const addBackdropSource = vi.fn((_config: DomBackdropSourceConfig) => handle);
  const context = { addBackdropSource } as unknown as GlassContext;
  return { addBackdropSource, context, destroy, handle };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Vue DOM backdrop converter', () => {
  it('renders slot content and preserves its registration across option updates', async () => {
    const harness = createHarness();
    const wrapper = mount(LgBackdropConverter, {
      props: {
        backgroundColor: '#102030',
        captureLib: 'html2canvas',
        scale: 2,
        viewportCapture: { bufferY: 120, enabled: true },
        watchNodeChanges: false,
        watchPositionChanges: false,
        watchResize: false,
        zIndex: 4,
      },
      slots: {
        default: ({ requestBackdropRedraw }: LgBackdropConverterSlotProps) => h(
          'button',
          {
            'data-capture-content': '',
            onClick: requestBackdropRedraw,
          },
          'Captured content',
        ),
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

    expect(wrapper.find('[data-capture-content]').text()).toBe('Captured content');
    expect(harness.addBackdropSource).toHaveBeenCalledTimes(1);
    expect(harness.addBackdropSource).toHaveBeenCalledWith({
      backgroundColor: '#102030',
      captureLibrary: 'html2canvas',
      element: wrapper.element,
      kind: 'dom',
      scale: 2,
      viewportCapture: { bufferY: 120, enabled: true },
      watchNodeChanges: false,
      watchPositionChanges: false,
      watchResize: false,
      zIndex: 4,
    });

    await wrapper.find('[data-capture-content]').trigger('click');
    const api = wrapper.vm as unknown as LgBackdropConverterExposed;
    api.refresh();
    expect(harness.handle.refresh).toHaveBeenCalledTimes(2);
    expect(api.getHandle()).toBe(harness.handle);

    await wrapper.setProps({
      captureLibrary: 'html-to-image',
      scale: 1,
      viewportCapture: false,
      watchNodeChanges: true,
      watchPositionChanges: true,
      watchResize: true,
      zIndex: 8,
    });
    await nextTick();

    expect(harness.addBackdropSource).toHaveBeenCalledTimes(1);
    expect(harness.handle.update).toHaveBeenCalledTimes(1);
    expect(harness.handle.update).toHaveBeenLastCalledWith({
      backgroundColor: '#102030',
      captureLibrary: 'html-to-image',
      scale: 1,
      viewportCapture: false,
      watchNodeChanges: true,
      watchPositionChanges: true,
      watchResize: true,
      zIndex: 8,
    });
    expect(api.getHandle()).toBe(harness.handle);

    wrapper.unmount();
    expect(harness.destroy).toHaveBeenCalledTimes(1);
    expect(api.getHandle()).toBeNull();
  });
});
