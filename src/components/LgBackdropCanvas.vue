<script setup lang="ts">
import {
  onMounted, onUnmounted, ref, watch,
} from 'vue';

import { useLiquidContext } from '../core/LiquidContext';
import { LiquidRendererBackdropElement } from '../core/LiquidRendererBackdropElement';
import { CustomDrawCallback } from '../types/LiquidGlass';

const props = defineProps<{
  draw: CustomDrawCallback;
  zIndex?: number;
}>();

const rendered = ref<boolean>(false);

const manager = useLiquidContext();
const backdropManager = ref<LiquidRendererBackdropElement | null>(null);
const element = ref<HTMLImageElement | null>(null);

const drawCanvas = async (callback: CustomDrawCallback) => {
  const data = await backdropManager.value!.drawUserContentToCanvas(callback);

  // Draw to img
  const { canvas } = data;
  if (element.value) {
    // Draw the OffscreenCanvas content to the img element
    element.value.src = await canvas.convertToBlob().then((blob) => URL.createObjectURL(blob));
    rendered.value = true;
  }
};

const register = async (callback: CustomDrawCallback) => {
  if (!element.value) return;
  backdropManager.value = new LiquidRendererBackdropElement(manager, element.value, {
    type: 'canvas',
    userCanvasCallback: callback,
    zIndex: props.zIndex,
  });

  drawCanvas(callback);
};

const unregister = () => {
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

</script>

<template>
  <img ref="element" :rendered="rendered">
</template>

<style scoped>
img {
  width: 100%;
  height: 100%;
  display: block;
}

img[rendered="false"] {
  opacity: 0;
}
</style>
