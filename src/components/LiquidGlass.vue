<!--
  LiquidGlass.vue - Main container component for Liquid Glass effects

  This component provides:
  - A rendering context for child LiquidGlassMaterial components
  - Backdrop capture coordination via LgBackdropConverter/LgBackdropCanvas
  - Scroll handling for scrollable content areas
  - Nested LiquidGlass support with automatic render precision inheritance
  - Cross-component render delegation via proxyInterface

  @example
  <LiquidGlass :scrollable="true" :render-precision="0.8">
    <LgBackdropConverter>
      <YourBackdropContent />
    </LgBackdropConverter>
    <LiquidGlassMaterial :radius="20">
      <YourGlassContent />
    </LiquidGlassMaterial>
  </LiquidGlass>
-->
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

import { useExternalRenderer } from '../composables/useExternalRenderer';
import {
  provideLiquidContext, provideLiquidDepth, useLiquidContext, useLiquidDepth,
} from '../core/LiquidContext';
import { LiquidRendererBackdropElement } from '../core/LiquidRendererBackdropElement';
import { LiquidRendererManager } from '../core/LiquidRendererManager';
import { LiquidRendererFullCanvasRenderedEvent, ThemeColorThresholds } from '../types/LiquidGlass';

const props = defineProps<{
  debug?: boolean;
  renderPrecision?: number;
  renderMode?: 'uniform' | 'dedicated';
  powerEfficientMode?: boolean;
  scrollable?: boolean;
  zIndex?: number;
  /**
   * Theme color detection thresholds for automatic background color mode.
   * - ultraDarkMax: Maximum luma for ultra_dark mode (default: 25)
   * - darkMax: Maximum luma for dark mode (default: 85)
   * - ultraLightMin: Minimum luma for ultra_light mode (default: 230)
   */
  themeColorThresholds?: ThemeColorThresholds;
}>();

const uniformCanvas = ref<HTMLCanvasElement | null>(null);
const parentDepth = useLiquidDepth(-1);
const depth = (parentDepth ?? -1) + 1;

// Try to get parent LiquidRendererManager from context
let parentManager: LiquidRendererManager | null = null;
const backdropManager = ref<LiquidRendererBackdropElement | null>(null);
try {
  parentManager = useLiquidContext();
} catch {
  // No parent context found
}

// Inherit renderPrecision from parent manager if not explicitly set
// This ensures nested LiquidGlass components use consistent pixel scaling
const effectiveRenderPrecision = props.renderPrecision ?? (parentManager?.getRenderPrecision() ?? 0);

// Initialize the LiquidRendererManager
const manager: LiquidRendererManager = new LiquidRendererManager({
  debug: props.debug ?? false,
  renderPrecision: effectiveRenderPrecision,
  renderMode: props.renderMode ?? 'uniform',
  powerEfficientMode: props.powerEfficientMode ?? false,
});

provideLiquidContext(manager);
provideLiquidDepth(depth);

const container = ref<HTMLElement | null>(null);

// Setup external renderer for cross-component render delegation
// This allows external materials (from parent LiquidGlass) to delegate
// their glass rendering to this component
const {
  proxyInterface,
  externalMaterials,
  calculateCanvasCoords,
} = useExternalRenderer({
  manager,
  container,
});

const canvasZIndex = computed(() => (props.zIndex !== undefined
  ? props.zIndex - 1
  : 9999 - depth * 2));

const isFallbackMode = ref<boolean>(false);
const onFallbackModeChanged = (fallback: boolean) => {
  isFallbackMode.value = fallback;
};
manager.on('fallbackModeChanged', onFallbackModeChanged);

isFallbackMode.value = manager.isFallbackMode;

watch(() => [props.debug, props.renderPrecision, props.renderMode, props.powerEfficientMode, props.scrollable, props.themeColorThresholds], () => {
  // Use effectiveRenderPrecision which inherits from parent if not set
  const newRenderPrecision = props.renderPrecision ?? (parentManager?.getRenderPrecision() ?? 0);
  manager.setOptions({
    debug: props.debug,
    renderPrecision: newRenderPrecision,
    renderMode: props.renderMode,
    powerEfficientMode: props.powerEfficientMode,
    scrollable: props.scrollable,
    themeColorThresholds: props.themeColorThresholds,
  });
});

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
      renderPrecision: effectiveRenderPrecision,
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

        // Use actualCssSize which accounts for canvas dimension clamping on mobile
        // This ensures CSS dimensions match the actual physical canvas content
        uniformCanvas.value.style.width = `${manager.actualCssSize.width}px`;
        uniformCanvas.value.style.height = `${manager.actualCssSize.height}px`;

        const ctx = uniformCanvas.value.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, manager.materialsCanvas.width, manager.materialsCanvas.height);
          ctx.drawImage(manager.materialsCanvas, 0, 0, manager.materialsCanvas.width, manager.materialsCanvas.height);
        }
      }
    }

    // If has parent, update parent with current viewport composite
    // Materials rendering is the final step after backdrop capture, so we update parent here
    // This covers both backdrop changes and scroll-only changes (which skip backdrop capture)
    if (backdropManager.value) {
      manager.renderFullComposite(manager.lastTextureDirtyReason);
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
    manager.renderFullComposite('structural');
  }
});

onUnmounted(() => {
  manager.off('fallbackModeChanged', onFallbackModeChanged);
});

/**
 * Force a complete refresh of the rendering pipeline.
 * This will recalculate all positions, visibility, and re-render everything.
 */
const refresh = () => manager.refresh();

/**
 * Update visibility and opacity for all registered elements.
 * Call this when you've changed opacity/visibility CSS properties.
 */
const refreshVisibility = () => manager.refreshVisibility();

/**
 * Mark the layout as dirty to trigger position/size recalculation.
 */
const markLayoutDirty = () => manager.markLayoutDirty();

// Expose the proxy interface for cross-component render delegation
// External materials can use this interface to delegate their glass rendering
defineExpose({
  /**
   * Proxy interface for cross-component render delegation.
   * Pass this to a LiquidGlassMaterial's `proxyTarget` prop to have
   * this LiquidGlass render the glass effect for that material.
   */
  proxyInterface,

  /**
   * The current external materials being rendered by this LiquidGlass
   */
  externalMaterials,

  /**
   * Calculate canvas coordinates for an external material configuration
   */
  calculateCanvasCoords,

  /**
   * The LiquidRendererManager instance for this LiquidGlass
   */
  manager,

  /**
   * Force a complete refresh of the rendering pipeline.
   * This will recalculate all positions, visibility, and re-render everything.
   * @example
   * liquidGlassRef.value?.refresh()
   */
  refresh,

  /**
   * Update visibility and opacity for all registered elements.
   * Call this when you've changed opacity/visibility CSS properties.
   * @example
   * liquidGlassRef.value?.refreshVisibility()
   */
  refreshVisibility,

  /**
   * Mark the layout as dirty to trigger position/size recalculation on next frame.
   * @example
   * liquidGlassRef.value?.markLayoutDirty()
   */
  markLayoutDirty,
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
