<template>
  <div class="lg-backdrop-canvas">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import {
  nextTick, onBeforeUnmount, onMounted, ref, watch,
} from 'vue';

import { useLiquidContext } from '../core/LiquidContext';

const props = defineProps<{
  drawFunction:(ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  id?: string;
  zIndex?: number;
  debugLabel?: string;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const manager = useLiquidContext();
const sourceId = props.id || crypto.randomUUID();

const draw = async () => {
  if (!canvas.value) return;
  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;

  const { width } = canvas.value;
  const { height } = canvas.value;

  // Clear
  ctx.clearRect(0, 0, width, height);

  // Draw user content
  await Promise.resolve(props.drawFunction(ctx, width, height));

  // Send to manager
  await nextTick();
  const workerBitmap = await createImageBitmap(canvas.value);
  const previewBitmap = await createImageBitmap(canvas.value);
  const rect = canvas.value.getBoundingClientRect();

  manager.updateTextureMap({
    id: sourceId,
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    imageBitmap: workerBitmap,
    previewBitmap,
    zIndex: props.zIndex ?? 0,
    sourceType: 'canvas',
    debugLabel: props.debugLabel,
  });
};

onMounted(() => {
  manager.registerSource(sourceId, 'canvas', props.debugLabel);
  void draw();
});

watch(() => props.drawFunction, () => {
  void draw();
});

onBeforeUnmount(() => {
  manager.unregisterSource(sourceId);
});
</script>
