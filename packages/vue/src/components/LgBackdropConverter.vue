<script setup lang="ts">
import type {
  BackdropSourceChanges,
  BackdropSourceHandle,
  DomBackdropSourceConfig,
} from '@agou/liquid-glass-core';
import { shallowRef, useTemplateRef, watch } from 'vue';

import { useLiquidGlassContext } from '../composables/liquidGlassContext';
import type {
  LgBackdropConverterExposed,
  LgBackdropConverterProps,
  LgBackdropConverterSlotProps,
} from '../types';

defineOptions({
  name: 'LgBackdropConverter',
  inheritAttrs: false,
});

const props = defineProps<LgBackdropConverterProps>();
defineSlots<{
  /** Render DOM content that core captures as the backdrop texture. */
  // eslint-disable-next-line no-unused-vars -- The name documents Vue's typed slot contract.
  default(props: LgBackdropConverterSlotProps): unknown;
}>();

const { context } = useLiquidGlassContext();
const element = useTemplateRef<HTMLElement>('element');
const handle = shallowRef<BackdropSourceHandle<DomBackdropSourceConfig> | null>(null);

function readChanges(): BackdropSourceChanges<DomBackdropSourceConfig> {
  const viewportCapture = props.viewportCapture;
  return {
    backgroundColor: props.backgroundColor,
    captureLibrary: props.captureLibrary ?? props.captureLib ?? 'html-to-image',
    scale: props.scale,
    viewportCapture: typeof viewportCapture === 'object'
      ? { ...viewportCapture }
      : viewportCapture,
    watchNodeChanges: props.watchNodeChanges ?? true,
    watchPositionChanges: props.watchPositionChanges ?? true,
    watchResize: props.watchResize ?? true,
    zIndex: props.zIndex,
  };
}

watch(
  [context, element],
  ([currentContext, captureElement], _previous, onCleanup) => {
    if (!currentContext || !captureElement) {
      return;
    }

    const registration = currentContext.addBackdropSource({
      kind: 'dom',
      element: captureElement,
      ...readChanges(),
    });
    handle.value = registration;

    onCleanup(() => {
      registration.destroy();
      if (handle.value === registration) {
        handle.value = null;
      }
    });
  },
  { immediate: true, flush: 'post' },
);

watch(
  readChanges,
  (changes) => handle.value?.update(changes),
  { deep: true },
);

function refresh(): void {
  handle.value?.refresh();
}

const exposed: LgBackdropConverterExposed = {
  getHandle: () => handle.value,
  refresh,
  requestBackdropRedraw: refresh,
};

defineExpose(exposed);
</script>

<template>
  <div
    ref="element"
    class="liquid-glass-backdrop-converter"
    v-bind="$attrs"
  >
    <slot
      :refresh="refresh"
      :request-backdrop-redraw="refresh"
    />
  </div>
</template>
