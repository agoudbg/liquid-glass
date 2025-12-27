<!--
  LgBackdropCanvas.vue - Custom canvas drawing for backdrop effects

  This component allows developers to provide a custom drawing function
  that renders content to a canvas, which serves as the backdrop for
  LiquidGlassMaterial refraction effects.

  @example
  <LgBackdropCanvas :draw="drawFunction" />

  // In your component:
  const drawFunction: CustomDrawCallback = (ctx, width, height) => {
    ctx.fillStyle = 'blue';
    ctx.fillRect(0, 0, width, height);
  };
-->
<script setup lang="ts">
import {
  onMounted, onUnmounted, ref, watch,
} from 'vue';

import { useLiquidContext } from '../core/LiquidContext';
import { LiquidRendererBackdropElement } from '../core/LiquidRendererBackdropElement';
import { CustomDrawCallback } from '../types/LiquidGlass';

/** Props for the LgBackdropCanvas component */
const props = defineProps<{
  /** Custom drawing function that renders backdrop content */
  draw: CustomDrawCallback;
  /** Z-index for backdrop layer ordering */
  zIndex?: number;
}>();

const rendered = ref<boolean>(false);

const manager = useLiquidContext();
const backdropManager = ref<LiquidRendererBackdropElement | null>(null);
const element = ref<HTMLImageElement | null>(null);

// MEMORY FIX: Track the current Object URL to revoke it before creating a new one
let currentObjectUrl: string | null = null;

const drawCanvas = async (callback: CustomDrawCallback) => {
  const data = await backdropManager.value!.drawUserContentToCanvas(callback);

  // Draw to img
  const { canvas } = data;
  if (element.value) {
    // MEMORY FIX: Revoke the old Object URL before creating a new one
    // Object URLs hold references to blobs in memory and must be manually released
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
    }

    // Draw the OffscreenCanvas content to the img element
    const blob = await canvas.convertToBlob();
    currentObjectUrl = URL.createObjectURL(blob);
    element.value.src = currentObjectUrl;
    rendered.value = true;
  }
};

const register = async (callback: CustomDrawCallback) => {
  if (!element.value) return;
  backdropManager.value = new LiquidRendererBackdropElement(manager, element.value, {
    type: 'canvas',
    userCanvasCallback: callback,
    zIndex: props.zIndex,
    watchPositionChanges: true,
    watchResize: true,
  });

  drawCanvas(callback);

  backdropManager.value.on('requestBackdropCapture', () => {
    drawCanvas(callback);
  });
};

const unregister = () => {
  // MEMORY FIX: Clean up the Object URL when component is destroyed
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  backdropManager.value?.destroy();
  backdropManager.value = null;
};

onMounted(() => {
  if (element.value) register(props.draw);
});

onUnmounted(() => {
  unregister();
});

watch(() => props.draw, (newDraw, oldDraw) => {
  if (newDraw !== oldDraw) {
    drawCanvas(newDraw);
  }
}, { deep: false });

watch(() => props.zIndex, (newVal) => {
  backdropManager.value?.setOptions({ zIndex: newVal });
});

</script>

<template>
  <img ref="element" :rendered="rendered">
</template>

<style scoped>
img {
  width: 100%;
  height: 100%;
  display: block;
  user-select: none;
  pointer-events: none;
}

img[rendered="false"] {
  opacity: 0;
}
</style>
