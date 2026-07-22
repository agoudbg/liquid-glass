<script setup lang="ts">
import type {
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
} from '@agou/liquid-glass-core';
import { ref, shallowRef, watch } from 'vue';

import { useLiquidGlassContext } from '../composables/liquidGlassContext';
import type { LgBackdropCanvasProps } from '../types';

defineOptions({
  name: 'LgBackdropCanvas',
  inheritAttrs: false,
});

const props = defineProps<LgBackdropCanvasProps>();
const { context } = useLiquidGlassContext();
const element = ref<HTMLCanvasElement | null>(null);
const handle = shallowRef<BackdropSourceHandle<CanvasBackdropSourceConfig> | null>(null);

watch(
  [context, element],
  ([currentContext, canvas], _previous, onCleanup) => {
    if (!currentContext || !canvas) {
      return;
    }

    const registration = currentContext.addBackdropSource({
      kind: 'canvas',
      element: canvas,
      draw: props.draw,
      zIndex: props.zIndex,
      watchPositionChanges: true,
      watchResize: true,
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
  () => [props.draw, props.zIndex] as const,
  ([draw, zIndex]) => {
    handle.value?.update({ draw, zIndex });
  },
);
</script>

<template>
  <canvas
    ref="element"
    class="liquid-glass-backdrop-canvas"
    aria-hidden="true"
    v-bind="$attrs"
  />
</template>
