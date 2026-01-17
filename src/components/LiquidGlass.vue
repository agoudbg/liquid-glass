<!--
  LiquidGlass.vue - Main container component for Liquid Glass effects

  This component provides:
  - A rendering context for child LiquidGlassMaterial components
  - Backdrop capture coordination via LgBackdropConverter/LgBackdropCanvas
  - Scroll handling for scrollable content areas
  - Nested LiquidGlass support with automatic render precision inheritance
  - Cross-component render delegation via proxyInterface

  Architecture:
  ```
  <LiquidGlass> (this component)
    │
    ├─ LiquidRendererManager (core rendering engine)
    │   ├─ Backdrop elements (LgBackdropConverter, LgBackdropCanvas)
    │   ├─ Material elements (LiquidGlassMaterial)
    │   └─ WebGL renderer (liquidGlassRenderer)
    │
    ├─ uniformCanvas (displays WebGL-rendered glass effects)
    │
    └─ slot (your content)
        ├─ LgBackdropConverter (captures DOM as texture)
        └─ LiquidGlassMaterial (displays glass effect)
  ```

  Render Modes:
  - 'uniform': Single canvas for all materials (default, better performance)
  - 'dedicated': Each material has its own canvas (more flexible positioning)

  Props:
  - debug: Enable debug logging
  - renderPrecision: Quality scale (0-1, affects canvas resolution)
  - renderMode: 'uniform' | 'dedicated'
  - enableBlurredEffect: Hide border/shadow when window loses focus
  - scrollable: Enable scroll handling
  - zIndex: Custom z-index for the canvas
  - themeColorThresholds: Custom thresholds for automatic theme detection

  @slot default - Content to render inside the LiquidGlass container
    - LgBackdropConverter: Wrap content to be used as backdrop texture
    - LgBackdropCanvas: Draw custom content as backdrop
    - LiquidGlassMaterial: Display glass effect panels

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
      <canvas v-if="shouldShowUniformCanvas" class="liquid-glass-uniform-canvas"
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
  enableBlurredEffect?: boolean;
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
  enableBlurredEffect: props.enableBlurredEffect ?? false,
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

watch(() => [props.debug, props.renderPrecision, props.renderMode, props.enableBlurredEffect, props.scrollable, props.themeColorThresholds], () => {
  // Use effectiveRenderPrecision which inherits from parent if not set
  const newRenderPrecision = props.renderPrecision ?? (parentManager?.getRenderPrecision() ?? 0);
  manager.setOptions({
    debug: props.debug,
    renderPrecision: newRenderPrecision,
    renderMode: props.renderMode,
    enableBlurredEffect: props.enableBlurredEffect,
    scrollable: props.scrollable,
    themeColorThresholds: props.themeColorThresholds,
  });
});

const currentRenderMode = ref(manager.renderMode);
const hasUniformMaterials = ref(false);

// Computed property to determine if uniform canvas should be shown
// Shows when: manager is in uniform mode OR any material overrides to uniform mode
const shouldShowUniformCanvas = computed(() => currentRenderMode.value === 'uniform' || hasUniformMaterials.value);

manager.on('optionsChanged', () => {
  currentRenderMode.value = manager.renderMode;
});

// Update hasUniformMaterials when materials change
manager.on('materialElementChanged', () => {
  hasUniformMaterials.value = manager.hasUniformMaterials();
});

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
      enableBlurredEffect: props.enableBlurredEffect ?? false,
      requireFullRender: !!backdropManager.value,
      scrollable: props.scrollable ?? false,
    },
  );

  manager.on('materialsRendered', () => {
    // Update the uniform canvas if it's being shown
    // (either due to manager mode OR per-material overrides)
    if (shouldShowUniformCanvas.value) {
      if (uniformCanvas.value) {
        uniformCanvas.value.width = manager.materialsCanvas.width;
        uniformCanvas.value.height = manager.materialsCanvas.height;

        // Use actualCssSize which accounts for canvas dimension clamping on mobile
        // This ensures CSS dimensions match the actual physical canvas content
        uniformCanvas.value.style.width = `${manager.actualCssSize.width}px`;
        uniformCanvas.value.style.height = `${manager.actualCssSize.height}px`;

        // VIEWPORT MODE: Use fixed positioning relative to the container
        // In viewport mode, the canvas represents only the visible viewport area.
        // We use fixed positioning so Canvas doesn't affect scroll height.
        const isViewportMode = manager.isInViewportMode();
        uniformCanvas.value.classList.toggle('viewport-mode', isViewportMode);

        if (isViewportMode) {
          // Position fixed canvas at the container's position in the viewport
          const containerRect = container.value?.getBoundingClientRect();
          if (containerRect) {
            // The canvas content starts at viewportOrigin, but we're displaying at current scroll.
            // We need to offset the canvas position by the difference between scroll and viewportOrigin.
            const viewportOrigin = manager.getViewportOrigin();
            const scrollOffset = manager.scroll.y - viewportOrigin.y;

            // Canvas should be positioned above the container by scrollOffset
            uniformCanvas.value.style.top = `${containerRect.top - scrollOffset}px`;
            uniformCanvas.value.style.left = `${containerRect.left}px`;
          }
          uniformCanvas.value.style.transform = '';
        } else {
          uniformCanvas.value.style.transform = '';
          uniformCanvas.value.style.top = '0';
          uniformCanvas.value.style.left = '0';
        }

        const ctx = uniformCanvas.value.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, manager.materialsCanvas.width, manager.materialsCanvas.height);
          ctx.drawImage(manager.materialsCanvas, 0, 0, manager.materialsCanvas.width, manager.materialsCanvas.height);

          // Clear out regions occupied by materials using 'dedicated' render mode
          // This prevents double-rendering when mixed modes are used
          const deviceScale = manager.getDeviceScale();
          const viewportOrigin = isViewportMode ? manager.getViewportOrigin() : { x: 0, y: 0 };

          manager.registeredMaterialElements.forEach((material) => {
            if (material.getEffectiveRenderMode() === 'dedicated' && !material.isDelegatedToProxy) {
              const {
                position, size, transform,
              } = material;

              // Calculate the rendered position and size (accounting for transform)
              const scaleX = transform.scaleX || 1;
              const scaleY = transform.scaleY || 1;
              const translateX = transform.translateX || 0;
              const translateY = transform.translateY || 0;

              const renderedCenterX = position.x + size.width / 2 + translateX - viewportOrigin.x;
              const renderedCenterY = position.y + size.height / 2 + translateY - viewportOrigin.y;

              const transformedWidth = size.width * scaleX;
              const transformedHeight = size.height * scaleY;

              const renderedTopLeftX = renderedCenterX - transformedWidth / 2;
              const renderedTopLeftY = renderedCenterY - transformedHeight / 2;

              // Clear the region in physical pixels
              ctx.clearRect(
                renderedTopLeftX * deviceScale,
                renderedTopLeftY * deviceScale,
                transformedWidth * deviceScale,
                transformedHeight * deviceScale,
              );
            }
          });
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

  // Watch window blurred to set blurred state (for enableBlurredEffect feature)
  if (props.enableBlurredEffect) {
    const onBlur = () => manager.setBlurred(true);
    const onFocus = () => manager.setBlurred(false);
    const onVisibilityChange = () => manager.setBlurred(document.hidden);

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('visibilitychange', onVisibilityChange);
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

/* In viewport mode, use fixed positioning relative to the container
   to prevent Canvas from affecting scroll height */
.liquid-glass-uniform-canvas.viewport-mode {
  position: fixed;
  will-change: transform;
}

.liquid-glass-uniform-canvas[is-fallback-mode="true"] {
  visibility: hidden;
  opacity: 0;
}
</style>
