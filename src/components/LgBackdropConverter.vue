<template>
  <div ref="el" class="lg-backdrop-converter">
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import html2canvas from 'html2canvas';
import { inject, onMounted, ref } from 'vue';

import { useLiquidContext } from '../core/LiquidContext';

const el = ref<HTMLElement | null>(null);
const manager = useLiquidContext();

const capture = async () => {
  if (!el.value) return;

  try {
    const canvas = await html2canvas(el.value, {
      backgroundColor: null,
      logging: false,
    });

    const imageBitmap = await createImageBitmap(canvas);
    const rect = el.value.getBoundingClientRect();

    manager.updateTextureMap({
      id: crypto.randomUUID(), // Simple ID generation
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      imageBitmap,
      zIndex: 0, // TODO: Determine z-index
    });
  } catch (error) {
    console.error('Failed to capture element:', error);
  }
};

onMounted(() => {
  // Initial capture
  // In a real app, we might want to wait for content to be fully loaded
  setTimeout(capture, 100);

  // TODO: Add ResizeObserver and MutationObserver
});
</script>
