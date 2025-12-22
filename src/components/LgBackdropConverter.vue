<template>
  <div class="liquid-glass-backdrop-converter" ref="backdropElement">
    <slot :request-backdrop-redraw="requestBackdropRedraw"></slot>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue';

import { useLiquidContext } from '../core/LiquidContext';
import { LiquidRendererBackdropElement } from '../core/LiquidRendererBackdropElement';

const props = defineProps<{
  captureLib: 'html-to-image' | 'html2canvas';
  zIndex?: number;
}>();

const backdropElement = ref<HTMLElement | null>(null);
const backdropManager = ref<LiquidRendererBackdropElement | null>(null);

const defaultPixelRatio = window.devicePixelRatio || 1;

// Draw the backdrop using the selected library
const drawBackdrop = async () => {
  console.log('LgBackdropConverter: drawBackdrop called');
  if (!backdropManager.value) return;

  const { element } = backdropManager.value;
  if (!element) return;

  const captureLib = props.captureLib || 'html-to-image';

  console.log('LgBackdropConverter: capturing backdrop for element:', element);

  if (captureLib === 'html-to-image') {
    // Use html-to-image to capture the backdrop
    const { toCanvas } = await import('html-to-image');
    const canvas = await toCanvas(element, {
      // pixelRatio: window.devicePixelRatio || 1,
      pixelRatio: defaultPixelRatio,
      width: element.scrollWidth,
      height: element.scrollHeight,
    });
    console.log('LgBackdropConverter: captured canvas with html-to-image', {
      width: canvas.width,
      height: canvas.height,
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
      scale: defaultPixelRatio,
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
    console.log('LgBackdropConverter: captured canvas with html2canvas', {
      width: canvas.width,
      height: canvas.height,
    });
    const offscreenCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    const ctx = offscreenCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, 0);
      console.log('LgBackdropConverter: captured canvas with html2canvas, sending to manager');
      backdropManager.value.requestManagerBackdropCapture(offscreenCanvas);
    }
  }
};

onMounted(() => {
  console.log('LgBackdropConverter mounted');
  const manager = useLiquidContext();

  // Register self as a backdrop element
  if (backdropElement.value) {
    console.log('LgBackdropConverter: registering backdrop element with manager');
    backdropManager.value = new LiquidRendererBackdropElement(manager, backdropElement.value, {
      type: 'html',
      zIndex: props.zIndex,
      watchResize: true,
      watchNodeChanges: true,
      watchPositionChanges: true,
    });

    drawBackdrop();

    // Listen for re-capture requests from the backdrop element
    backdropManager.value.on('requestBackdropCapture', () => {
      // Draw the backdrop using the selected library
      console.log('LgBackdropConverter: received requestBackdropCapture event, drawing backdrop');
      drawBackdrop();
    });
  }
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
