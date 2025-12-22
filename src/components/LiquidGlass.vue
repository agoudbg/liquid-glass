<template>
  <div class="liquid-glass-container" ref="container">
    <div class="liquid-glass-content" ref="content">
      <canvas v-if="currentRenderMode === 'uniform'" class="liquid-glass-uniform-canvas"
        :is-fallback-mode="isFallbackMode" ref="uniformCanvas"></canvas>
      <slot></slot>
    </div>
  </div>
</template>

<script lang="ts" setup>

import {
  onMounted, onUnmounted, ref, watch,
} from 'vue';

import { provideLiquidContext, useLiquidContext } from '../core/LiquidContext';
import { LiquidRendererBackdropElement } from '../core/LiquidRendererBackdropElement';
import { LiquidRendererManager } from '../core/LiquidRendererManager';
import { LiquidRendererFullCanvasRenderedEvent } from '../types/LiquidGlass';

const props = defineProps<{
  debug?: boolean;
  renderPrecision?: number;
  renderMode?: 'uniform' | 'dedicated';
  powerEfficientMode?: boolean;
}>();

const uniformCanvas = ref<HTMLCanvasElement | null>(null);

// Try to get parent LiquidRendererManager from context
let parentManager = null;
const backdropManager = ref<LiquidRendererBackdropElement | null>(null);
try {
  parentManager = useLiquidContext();
} catch {
  // No parent context found
}

// Initialize the LiquidRendererManager
const manager: LiquidRendererManager = new LiquidRendererManager({
  debug: props.debug ?? false,
  renderPrecision: props.renderPrecision ?? 0,
  renderMode: props.renderMode ?? 'uniform',
  powerEfficientMode: props.powerEfficientMode ?? false,
});

provideLiquidContext(manager);

const isFallbackMode = ref<boolean>(false);
const onFallbackModeChanged = (fallback: boolean) => {
  isFallbackMode.value = fallback;
};
manager.on('fallbackModeChanged', onFallbackModeChanged);

isFallbackMode.value = manager.isFallbackMode;

watch(() => [props.debug, props.renderPrecision, props.renderMode, props.powerEfficientMode], () => {
  manager.setOptions({
    debug: props.debug,
    renderPrecision: props.renderPrecision,
    renderMode: props.renderMode,
    powerEfficientMode: props.powerEfficientMode,
  });
});

const container = ref<HTMLElement | null>(null);

const currentRenderMode = ref(manager.renderMode);
manager.on('optionsChanged', () => {
  currentRenderMode.value = manager.renderMode;
});

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
      requireFullRender: !!backdropManager.value,
    },
  );

  manager.on('materialsRendered', () => {
    // If is uniform mode, update the uniform canvas
    if (manager.renderMode === 'uniform') {
      if (uniformCanvas.value) {
        uniformCanvas.value.width = manager.materialsCanvas.width;
        uniformCanvas.value.height = manager.materialsCanvas.height;

        uniformCanvas.value.style.width = `${manager.size.width}px`;
        uniformCanvas.value.style.height = `${manager.size.height}px`;

        const ctx = uniformCanvas.value.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, manager.materialsCanvas.width, manager.materialsCanvas.height);
          ctx.drawImage(manager.materialsCanvas, 0, 0, manager.materialsCanvas.width, manager.materialsCanvas.height);
        }
      }
    }
  });

  manager.on('fullCanvasRendered', ({ canvas, width, height }: LiquidRendererFullCanvasRenderedEvent) => {
    // If has backdrop manager, upload backdrop to parent
    if (backdropManager.value) {
      backdropManager.value.requestManagerBackdropCapture(canvas);
    }
  });

  // Watch window blurred to change visibility state
  if (props.powerEfficientMode) {
    window.addEventListener('blur', () => setVisibility(false));

    window.addEventListener('focus', () => setVisibility(true));

    window.addEventListener('visibilitychange', () => setVisibility(!document.hidden));
  }
  // If has parent manager, register this manager as child
  if (parentManager) {
    backdropManager.value = new LiquidRendererBackdropElement(parentManager, container.value!, {
      type: 'liquid_glass',
      watchResize: true,
    });
    manager.renderFullCanvas();
  }
});

onUnmounted(() => {
  manager.off('fallbackModeChanged', onFallbackModeChanged);
});

</script>

<style scoped>
.page-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.liquid-glass-container {
  position: absolute;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.liquid-glass-content {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: auto;
}

.liquid-glass-uniform-canvas {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 9999;
  pointer-events: none;
  transition: visibility 0.2s ease, opacity 0.2s ease;
}

.liquid-glass-uniform-canvas[is-fallback-mode="true"] {
  visibility: hidden;
  opacity: 0;
}
</style>
