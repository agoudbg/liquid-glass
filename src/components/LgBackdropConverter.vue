<!--
  LgBackdropConverter.vue - Converts HTML content to canvas for backdrop effects

  This component captures its slotted HTML content and converts it to a canvas
  that serves as the backdrop for LiquidGlassMaterial refraction effects.

  Features:
  - Supports both html-to-image and html2canvas libraries
  - Automatic recapture on resize, mutation, and image load
  - Manual recapture via slot-exposed requestBackdropRedraw function

  @slot default - Content to capture as backdrop
    @binding request-backdrop-redraw - Function to manually trigger recapture

  @example
  <LgBackdropConverter capture-lib="html-to-image">
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
  onMounted, onUnmounted, ref, watch,
} from 'vue';

import { useLiquidContext } from '../core/LiquidContext';
import { LiquidRendererBackdropElement } from '../core/LiquidRendererBackdropElement';
import { getSafeDevicePixelRatio } from '../utils/featureDetect';

const props = defineProps<{
  captureLib?: 'html-to-image' | 'html2canvas';
  zIndex?: number;
}>();

const manager = useLiquidContext();
const backdropElement = ref<HTMLElement | null>(null);
const backdropManager = ref<LiquidRendererBackdropElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
let childResizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let imgLoadCleanups: Array<() => void> = [];

// Compute effective pixel ratio dynamically to pick up renderPrecision changes
const getEffectivePixelRatio = () => getSafeDevicePixelRatio() * manager.getRenderPrecision();

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

// Draw the backdrop using the selected library
const drawBackdrop = async () => {
  if (!backdropManager.value) return;

  const { element } = backdropManager.value;
  if (!element) return;

  const captureLib = props.captureLib || 'html-to-image';
  // Get effective pixel ratio at capture time to ensure it's up-to-date
  const effectivePixelRatio = getEffectivePixelRatio();

  if (captureLib === 'html-to-image') {
    // Use html-to-image to capture the backdrop
    const { toCanvas } = await import('html-to-image');
    const canvas = await toCanvas(element, {
      pixelRatio: effectivePixelRatio,
      width: element.scrollWidth,
      height: element.scrollHeight,
    });

    const offscreenCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    const ctx = offscreenCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, 0);
      backdropManager.value.requestManagerBackdropCapture(offscreenCanvas);
    }
  } else if (captureLib === 'html2canvas') {
    // Use html2canvas to capture the backdrop
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(element, {
      scale: effectivePixelRatio,
      width: element.scrollWidth,
      height: element.scrollHeight,
      onclone(document) {
        // Remove liquid glass materials
        const materials = document.querySelectorAll('.liquid-glass-material');
        materials.forEach((mat) => {
          (mat as HTMLElement).style.visibility = 'hidden';
        });
      },
    });

    const offscreenCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    const ctx = offscreenCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, 0);
      backdropManager.value.requestManagerBackdropCapture(offscreenCanvas);
    }
  }
};

onMounted(() => {
  // Register self as a backdrop element
  if (backdropElement.value) {
    backdropManager.value = new LiquidRendererBackdropElement(manager, backdropElement.value, {
      type: 'html',
      zIndex: props.zIndex,
      watchResize: true,
      watchNodeChanges: true,
      watchPositionChanges: true,
    });

    drawBackdrop();

    // ResizeObserver on the converted element to catch internal size changes
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

    // Listen for re-capture requests from the backdrop element
    backdropManager.value.on('requestBackdropCapture', () => {
      // Draw the backdrop using the selected library
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
  imgLoadCleanups.forEach((cleanup) => cleanup());
  imgLoadCleanups = [];
  backdropManager.value?.destroy();
});

watch(() => props.zIndex, (newVal) => {
  backdropManager.value?.setOptions({ zIndex: newVal });
});

watch(() => props.captureLib, () => {
  drawBackdrop();
});

// Allow slotted content to manually trigger a fresh capture
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
