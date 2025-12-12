<template>
  <div class="liquid-glass" ref="container">
    <canvas ref="canvas" class="liquid-glass__canvas"></canvas>
    <div class="liquid-glass__content">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  onBeforeUnmount, onMounted, ref, watch,
} from 'vue';

import { provideLiquidContext } from '../core/LiquidContext';
import { LiquidRendererManager } from '../core/LiquidRendererManager';

const props = defineProps<{ debug?: boolean }>();

const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const resizeObserver = ref<ResizeObserver | null>(null);
const manager = new LiquidRendererManager({ debug: props.debug });

provideLiquidContext(manager);

const resizeCanvas = () => {
  if (!container.value || !canvas.value) return;
  const rect = container.value.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.value.width = rect.width * dpr;
  canvas.value.height = rect.height * dpr;
  canvas.value.style.width = `${rect.width}px`;
  canvas.value.style.height = `${rect.height}px`;
};

onMounted(() => {
  if (canvas.value) {
    manager.initRenderer(canvas.value);
  }

  resizeCanvas();

  resizeObserver.value = new ResizeObserver(() => resizeCanvas());
  if (container.value) {
    resizeObserver.value.observe(container.value);
  }
});

watch(() => props.debug, (val) => {
  manager.setDebugEnabled(Boolean(val));
});

onBeforeUnmount(() => {
  resizeObserver.value?.disconnect();
  manager.destroy();
});
</script>

<style scoped>
.liquid-glass {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.liquid-glass__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.liquid-glass__content {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
}
</style>
