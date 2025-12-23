<template>
  <div class="liquid-glass-container" :class="{ 'scrollable': props.scrollable }" ref="container">
    <div class="liquid-glass-content" :class="{ 'scrollable': props.scrollable }" ref="content">
      <canvas v-if="currentRenderMode === 'uniform'" class="liquid-glass-uniform-canvas"
        :is-fallback-mode="isFallbackMode" :style="{ zIndex: canvasZIndex }" ref="uniformCanvas"></canvas>
      <slot></slot>
    </div>
  </div>
</template>

<script lang="ts" setup>

import {
  computed, onMounted, onUnmounted, ref, watch,
} from 'vue';

import {
  provideLiquidContext, provideLiquidDepth, useLiquidContext, useLiquidDepth,
} from '../core/LiquidContext';
import { LiquidRendererBackdropElement } from '../core/LiquidRendererBackdropElement';
import { LiquidRendererManager } from '../core/LiquidRendererManager';
import { LiquidRendererFullCanvasRenderedEvent } from '../types/LiquidGlass';

const props = defineProps<{
  debug?: boolean;
  renderPrecision?: number;
  renderMode?: 'uniform' | 'dedicated';
  powerEfficientMode?: boolean;
  scrollable?: boolean;
  zIndex?: number;
}>();

const uniformCanvas = ref<HTMLCanvasElement | null>(null);
const parentDepth = useLiquidDepth(-1);
const depth = (parentDepth ?? -1) + 1;

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
provideLiquidDepth(depth);

const canvasZIndex = computed(() => (props.zIndex !== undefined
  ? props.zIndex - 1
  : 9999 - depth * 2));

const isFallbackMode = ref<boolean>(false);
const onFallbackModeChanged = (fallback: boolean) => {
  isFallbackMode.value = fallback;
};
manager.on('fallbackModeChanged', onFallbackModeChanged);

isFallbackMode.value = manager.isFallbackMode;

watch(() => [props.debug, props.renderPrecision, props.renderMode, props.powerEfficientMode, props.scrollable], () => {
  manager.setOptions({
    debug: props.debug,
    renderPrecision: props.renderPrecision,
    renderMode: props.renderMode,
    powerEfficientMode: props.powerEfficientMode,
    scrollable: props.scrollable,
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
      scrollable: props.scrollable ?? false,
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

  // Listen to backdrop changes to update parent (not material changes)
  manager.on('backdropCaptured', () => {
    // Only when backdrop content changes, render full canvas for parent
    if (backdropManager.value) {
      manager.renderFullComposite();
    }
  });

  manager.on('fullCanvasRendered', ({ canvas }: LiquidRendererFullCanvasRenderedEvent) => {
    // If has backdrop manager, upload composite to parent
    // This is the "composite canvas" approach - only structural changes trigger this
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
      watchResize: false, // Don't watch resize - manager handles via RAF
      watchNodeChanges: true, // Only structural changes
    });
    manager.renderFullComposite();
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

.liquid-glass-container.scrollable {
  overflow: auto;
}

.liquid-glass-content {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.liquid-glass-content.scrollable {
  overflow: auto;
  /* Scrollable mode: content may be larger than viewport */
  min-width: 100%;
  min-height: 100%;
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
