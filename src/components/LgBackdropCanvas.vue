<template>
  <div class="lg-backdrop-canvas">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

import { useLiquidContext } from '../core/LiquidContext';

const props = defineProps<{
  drawFunction:(ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const manager = useLiquidContext();

const draw = async () => {
  if (!canvas.value) return;
  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;

  const { width } = canvas.value;
  const { height } = canvas.value;

  // Clear
  ctx.clearRect(0, 0, width, height);

  // Draw user content
  props.drawFunction(ctx, width, height);

  // Send to manager
  const imageBitmap = await createImageBitmap(canvas.value);
  const rect = canvas.value.getBoundingClientRect();

  manager.updateTextureMap({
    id: crypto.randomUUID(),
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    imageBitmap,
    zIndex: 0,
  });
};

onMounted(() => {
  draw();
});

watch(() => props.drawFunction, draw);
</script>
