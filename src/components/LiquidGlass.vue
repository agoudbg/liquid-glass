<template>
  <div class="liquid-glass-container" ref="container">
    <canvas v-if="manager?.renderMode === 'uniform'" class="liquid-glass-uniform-canvas"
      :is-fallback-mode="isFallbackMode" ref="uniformCanvas"></canvas>
    <slot></slot>
  </div>
</template>

<script lang="ts" setup>

import { onMounted, onUnmounted, ref } from 'vue';

import { provideLiquidContext } from '../core/LiquidContext';
import { LiquidRendererManager } from '../core/LiquidRendererManager';

const props = defineProps<{
  debug?: boolean;
  backgroundColor?: string;
  backgroundImage?: string;
  renderPrecision?: number;
  renderMode?: 'uniform' | 'dedicated';
  powerEfficientMode?: boolean;
}>();

const uniformCanvas = ref<HTMLCanvasElement | null>(null);

// Initialize the LiquidRendererManager
const manager: LiquidRendererManager = new LiquidRendererManager({ debug: props.debug ?? false });

provideLiquidContext(manager);

const isFallbackMode = ref<boolean>(false);
const onFallbackModeChanged = (fallback: boolean) => {
  isFallbackMode.value = fallback;
};
manager.on('fallbackModeChanged', onFallbackModeChanged);

isFallbackMode.value = manager.isFallbackMode;

const container = ref<HTMLElement | null>(null);

const setVisibility = (visible: boolean) => {
  manager.setVisibility(visible);
};

onMounted(() => {
  // Ensure the container is set
  if (!container.value) {
    console.error('LiquidGlass component requires a container element.');
  }

  // Create a LiquidRendererManager instance
  manager.setOptions(
    // Current element as container
    {
      container: container.value ?? undefined,
      debug: props.debug ?? false,
      renderPrecision: props.renderPrecision ?? 0,
      renderMode: props.renderMode ?? 'uniform',
      powerEfficientMode: props.powerEfficientMode ?? false,
    },
  );

  manager.on('materialsRendered', () => {
    console.log('LiquidGlass: materialsRendered event received');

    // if is uniform mode, update the uniform canvas
    if (manager.renderMode === 'uniform') {
      if (uniformCanvas.value) {
        uniformCanvas.value.width = manager.materialsCanvas.width;
        uniformCanvas.value.height = manager.materialsCanvas.height;
        const ctx = uniformCanvas.value.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, manager.materialsCanvas.width, manager.materialsCanvas.height);
          ctx.drawImage(manager.materialsCanvas, 0, 0, manager.materialsCanvas.width, manager.materialsCanvas.height);
        }
      }
    }
  });

  // Watch window blurred to change visibility state
  if (props.powerEfficientMode) {
    window.addEventListener('blur', () => setVisibility(false));

    window.addEventListener('focus', () => setVisibility(true));

    window.addEventListener('visibilitychange', () => setVisibility(!document.hidden));
  }
});
onUnmounted(() => {
  manager.off('fallbackModeChanged', onFallbackModeChanged);
});

</script>

<style scoped>
.liquid-glass-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.liquid-glass-uniform-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
  pointer-events: none;
  transition: visibility 0.2s ease, opacity 0.2s ease;
}

.liquid-glass-uniform-canvas[is-fallback-mode="true"] {
  visibility: hidden;
  opacity: 0;
}
</style>
