<!--
  LgBackdropConverter.vue - Converts HTML content to canvas for backdrop effects

  This component captures its slotted HTML content and converts it to a canvas
  that serves as the backdrop for LiquidGlassMaterial refraction effects.

  Features:
  - Supports both html-to-image and html2canvas libraries
  - Viewport-based capture optimization to reduce canvas memory on mobile
  - Automatic recapture on resize, mutation, and image load
  - Manual recapture via slot-exposed requestBackdropRedraw function

  @slot default - Content to capture as backdrop
    @binding request-backdrop-redraw - Function to manually trigger recapture

  @example
  <LgBackdropConverter capture-lib="html-to-image" :viewport-capture="{ bufferY: 200 }">
    <template #default="{ requestBackdropRedraw }">
      <div class="backdrop-content">
        <img src="background.jpg" />
        <button @click="requestBackdropRedraw">Refresh</button>
      </div>
    </template>
  </LgBackdropConverter>
-->
<template>
  <div class="liquid-glass-backdrop-converter" ref="backdropElement">
    <slot :request-backdrop-redraw="requestBackdropRedraw"></slot>
  </div>
</template>

<script lang="ts" setup>
import {
  computed,
  onMounted, onUnmounted, ref, watch,
} from 'vue';

import { useLiquidContext } from '../core/LiquidContext';
import { LiquidRendererBackdropElement } from '../core/LiquidRendererBackdropElement';
import type { ViewportCaptureConfig, ViewportCaptureRect } from '../types/LiquidGlass';
import { getSafeDevicePixelRatio } from '../utils/featureDetect';

const props = defineProps<{
  captureLib?: 'html-to-image' | 'html2canvas';
  zIndex?: number;
  /**
   * Viewport-based capture configuration.
   * When enabled, only captures the visible portion + buffer instead of the entire element.
   * This significantly reduces canvas memory usage on mobile devices.
   */
  viewportCapture?: ViewportCaptureConfig | boolean;
}>();

const manager = useLiquidContext();
const backdropElement = ref<HTMLElement | null>(null);
const backdropManager = ref<LiquidRendererBackdropElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
let childResizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let imgLoadCleanups: Array<() => void> = [];

// Track the current visible rect for viewport-based capture
const currentVisibleRect = ref<ViewportCaptureRect | null>(null);
// Track if element is in viewport at all
const isInViewport = ref(true);

// Compute effective pixel ratio dynamically to pick up renderPrecision changes
const getEffectivePixelRatio = () => getSafeDevicePixelRatio() * manager.getRenderPrecision();

// Parse viewport capture config
const viewportConfig = computed<ViewportCaptureConfig>(() => {
  if (props.viewportCapture === true) {
    return { enabled: true, bufferY: 200, bufferX: 0 };
  }
  if (props.viewportCapture && typeof props.viewportCapture === 'object') {
    return {
      enabled: props.viewportCapture.enabled ?? true,
      bufferY: props.viewportCapture.bufferY ?? 200,
      bufferX: props.viewportCapture.bufferX ?? 0,
    };
  }
  // Default: disabled for backward compatibility
  return { enabled: false, bufferY: 200, bufferX: 0 };
});

/**
 * Calculate the visible rect of the backdrop element relative to the viewport.
 * Returns the intersection rect with optional buffer, clamped to element bounds.
 */
const calculateVisibleRect = (): ViewportCaptureRect | null => {
  const el = backdropElement.value;
  if (!el) return null;

  const elementRect = el.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Calculate intersection with viewport
  const intersectLeft = Math.max(0, elementRect.left);
  const intersectTop = Math.max(0, elementRect.top);
  const intersectRight = Math.min(viewportWidth, elementRect.right);
  const intersectBottom = Math.min(viewportHeight, elementRect.bottom);

  // No intersection - element is completely outside viewport
  if (intersectLeft >= intersectRight || intersectTop >= intersectBottom) {
    return null;
  }

  const { bufferX = 0, bufferY = 200 } = viewportConfig.value;

  // Convert to element-relative coordinates and add buffer
  let x = intersectLeft - elementRect.left - bufferX;
  let y = intersectTop - elementRect.top - bufferY;
  let width = (intersectRight - intersectLeft) + bufferX * 2;
  let height = (intersectBottom - intersectTop) + bufferY * 2;

  // Clamp to element bounds
  if (x < 0) {
    width += x; // Reduce width by the amount x is negative
    x = 0;
  }
  if (y < 0) {
    height += y;
    y = 0;
  }

  const elementWidth = el.scrollWidth;
  const elementHeight = el.scrollHeight;

  if (x + width > elementWidth) {
    width = elementWidth - x;
  }
  if (y + height > elementHeight) {
    height = elementHeight - y;
  }

  // Ensure valid dimensions
  if (width <= 0 || height <= 0) return null;

  return {
    x, y, width, height,
  };
};

const triggerBackdropCapture = () => {
  if (!backdropManager.value) return;
  // Ask the backdrop element to queue a fresh capture and let the manager debounce work
  backdropManager.value.sendReCaptureRequest();
};

const bindImageLoadListeners = () => {
  // Clear old listeners before re-binding to avoid leaks
  imgLoadCleanups.forEach((cleanup) => cleanup());
  imgLoadCleanups = [];

  const root = backdropElement.value;
  if (!root) return;

  root.querySelectorAll('img').forEach((img) => {
    const handler = () => triggerBackdropCapture();
    img.addEventListener('load', handler, { once: false });
    imgLoadCleanups.push(() => img.removeEventListener('load', handler));
  });
};

const attachChildResizeObserver = () => {
  const root = backdropElement.value;
  if (!root) return;

  const firstChild = root.firstElementChild as HTMLElement | null;
  if (!firstChild) return;

  if (childResizeObserver) {
    childResizeObserver.disconnect();
  }

  childResizeObserver = new ResizeObserver(() => {
    backdropManager.value?.updatePositionAndSize({ suppressReRender: true });
    triggerBackdropCapture();
  });
  childResizeObserver.observe(firstChild);
};

/**
 * Draw the backdrop using the selected library.
 * When viewport capture is enabled, only captures the visible area + buffer.
 */
const drawBackdrop = async () => {
  if (!backdropManager.value) return;

  const { element } = backdropManager.value;
  if (!element) return;

  // Skip capture if not in viewport and viewport capture is enabled
  if (viewportConfig.value.enabled && !isInViewport.value) {
    return;
  }

  const captureLib = props.captureLib || 'html-to-image';
  const effectivePixelRatio = getEffectivePixelRatio();

  // Determine capture region
  let captureRect: ViewportCaptureRect | null = null;
  if (viewportConfig.value.enabled) {
    captureRect = calculateVisibleRect();
    if (!captureRect) {
      // No visible area to capture
      return;
    }
    currentVisibleRect.value = captureRect;
  }

  if (captureLib === 'html-to-image') {
    const { toCanvas } = await import('html-to-image');

    // Configure capture options based on viewport capture mode
    const captureOptions: Parameters<typeof toCanvas>[1] = {
      pixelRatio: effectivePixelRatio,
    };

    if (captureRect) {
      // Viewport-based capture: only capture the visible rect
      // We need to use the filter option to clip to the visible area
      // html-to-image doesn't support direct clipping, so we capture full then crop
      captureOptions.width = element.scrollWidth;
      captureOptions.height = element.scrollHeight;
    } else {
      captureOptions.width = element.scrollWidth;
      captureOptions.height = element.scrollHeight;
    }

    const canvas = await toCanvas(element, captureOptions);

    let offscreenCanvas: OffscreenCanvas;
    let viewportRectForManager: ViewportCaptureRect | undefined;

    if (captureRect) {
      // Crop the canvas to the visible rect
      const cropX = Math.round(captureRect.x * effectivePixelRatio);
      const cropY = Math.round(captureRect.y * effectivePixelRatio);
      const cropWidth = Math.round(captureRect.width * effectivePixelRatio);
      const cropHeight = Math.round(captureRect.height * effectivePixelRatio);

      offscreenCanvas = new OffscreenCanvas(cropWidth, cropHeight);
      const ctx = offscreenCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(
          canvas,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          0,
          0,
          cropWidth,
          cropHeight,
        );
      }
      viewportRectForManager = captureRect;
    } else {
      // Full element capture
      offscreenCanvas = new OffscreenCanvas(canvas.width, canvas.height);
      const ctx = offscreenCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, 0);
      }
    }

    backdropManager.value.requestManagerBackdropCapture(offscreenCanvas, viewportRectForManager);
  } else if (captureLib === 'html2canvas') {
    const html2canvas = (await import('html2canvas')).default;

    // html2canvas supports direct x, y, width, height options for partial capture
    const captureOptions: Parameters<typeof html2canvas>[1] = {
      scale: effectivePixelRatio,
      onclone(document) {
        const materials = document.querySelectorAll('.liquid-glass-material');
        materials.forEach((mat) => {
          (mat as HTMLElement).style.visibility = 'hidden';
        });
      },
    };

    if (captureRect) {
      captureOptions.x = captureRect.x;
      captureOptions.y = captureRect.y;
      captureOptions.width = captureRect.width;
      captureOptions.height = captureRect.height;
    } else {
      captureOptions.width = element.scrollWidth;
      captureOptions.height = element.scrollHeight;
    }

    const canvas = await html2canvas(element, captureOptions);

    const offscreenCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    const ctx = offscreenCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, 0);
      backdropManager.value.requestManagerBackdropCapture(
        offscreenCanvas,
        captureRect ?? undefined,
      );
    }
  }
};

/**
 * Setup IntersectionObserver for viewport-based capture.
 * Triggers recapture when visibility changes.
 */
const setupIntersectionObserver = () => {
  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }

  if (!viewportConfig.value.enabled || !backdropElement.value) return;

  // Use a threshold array to detect partial visibility changes
  const thresholds = [0, 0.1, 0.25, 0.5, 0.75, 1.0];

  intersectionObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      const wasInViewport = isInViewport.value;
      isInViewport.value = entry.isIntersecting;

      // Recapture when entering viewport or intersection ratio changes significantly
      if (entry.isIntersecting) {
        const newRect = calculateVisibleRect();
        const oldRect = currentVisibleRect.value;

        // Check if visible rect changed enough to warrant recapture
        const shouldRecapture = !oldRect
          || !newRect
          || Math.abs(oldRect.y - newRect.y) > 50
          || Math.abs(oldRect.height - newRect.height) > 50
          || !wasInViewport;

        if (shouldRecapture) {
          triggerBackdropCapture();
        }
      }
    },
    {
      threshold: thresholds,
      // Extend root margin to start capturing before fully in view
      rootMargin: `${viewportConfig.value.bufferY ?? 200}px 0px`,
    },
  );

  intersectionObserver.observe(backdropElement.value);
};

/**
 * Handle scroll events for viewport-based capture.
 * Uses throttling to avoid excessive recaptures during fast scrolling.
 */
let scrollThrottleTimer: number | null = null;
const handleScroll = () => {
  if (!viewportConfig.value.enabled) return;

  if (scrollThrottleTimer !== null) return;

  scrollThrottleTimer = window.setTimeout(() => {
    scrollThrottleTimer = null;

    if (!isInViewport.value) return;

    const newRect = calculateVisibleRect();
    const oldRect = currentVisibleRect.value;

    // Only recapture if the visible region has shifted significantly
    if (newRect && oldRect) {
      const yDelta = Math.abs(newRect.y - oldRect.y);
      // Recapture when scrolled past half the buffer
      if (yDelta > (viewportConfig.value.bufferY ?? 200) / 2) {
        triggerBackdropCapture();
      }
    } else if (newRect && !oldRect) {
      triggerBackdropCapture();
    }
  }, 100); // 100ms throttle
};

onMounted(() => {
  if (backdropElement.value) {
    backdropManager.value = new LiquidRendererBackdropElement(manager, backdropElement.value, {
      type: 'html',
      zIndex: props.zIndex,
      watchResize: true,
      watchNodeChanges: true,
      watchPositionChanges: true,
    });

    drawBackdrop();

    resizeObserver = new ResizeObserver(() => {
      backdropManager.value?.updatePositionAndSize({ suppressReRender: true });
      triggerBackdropCapture();
    });
    resizeObserver.observe(backdropElement.value);

    attachChildResizeObserver();

    mutationObserver = new MutationObserver(() => {
      backdropManager.value?.updatePositionAndSize({ suppressReRender: true });
      attachChildResizeObserver();
      bindImageLoadListeners();
      triggerBackdropCapture();
    });
    mutationObserver.observe(backdropElement.value, { childList: true, subtree: true });

    bindImageLoadListeners();

    // Setup viewport-based capture observers
    setupIntersectionObserver();
    if (viewportConfig.value.enabled) {
      window.addEventListener('scroll', handleScroll, { passive: true });
    }

    backdropManager.value.on('requestBackdropCapture', () => {
      drawBackdrop();
    });
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  childResizeObserver?.disconnect();
  childResizeObserver = null;
  mutationObserver?.disconnect();
  mutationObserver = null;
  intersectionObserver?.disconnect();
  intersectionObserver = null;
  imgLoadCleanups.forEach((cleanup) => cleanup());
  imgLoadCleanups = [];
  if (scrollThrottleTimer !== null) {
    clearTimeout(scrollThrottleTimer);
    scrollThrottleTimer = null;
  }
  window.removeEventListener('scroll', handleScroll);
  backdropManager.value?.destroy();
});

watch(() => props.zIndex, (newVal) => {
  backdropManager.value?.setOptions({ zIndex: newVal });
});

watch(() => props.captureLib, () => {
  drawBackdrop();
});

watch(viewportConfig, (newConfig, oldConfig) => {
  // Re-setup observers when viewport capture config changes
  if (newConfig.enabled !== oldConfig?.enabled) {
    if (newConfig.enabled) {
      setupIntersectionObserver();
      window.addEventListener('scroll', handleScroll, { passive: true });
    } else {
      intersectionObserver?.disconnect();
      intersectionObserver = null;
      window.removeEventListener('scroll', handleScroll);
      // Clear viewport rect and recapture full element
      currentVisibleRect.value = null;
      triggerBackdropCapture();
    }
  }
}, { deep: true });

const requestBackdropRedraw = () => {
  drawBackdrop();
};
defineExpose({ requestBackdropRedraw });
</script>

<style scoped>
.liquid-glass-backdrop-converter {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
