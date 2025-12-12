<template>
  <div class="liquid-glass-backdrop-layer" ref="container">
    <slot></slot>
    <canvas ref="canvas" class="liquid-glass-renderer"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { provideLiquidContext } from '../core/LiquidContext';
import { LiquidRendererManager } from '../core/LiquidRendererManager';

const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const manager = new LiquidRendererManager();

provideLiquidContext(manager);

onMounted(() => {
  if (canvas.value) {
    manager.initRenderer(canvas.value);
  }
});

onBeforeUnmount(() => {
  manager.destroy();
});
</script>

<style scoped>
.liquid-glass-backdrop-layer {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.liquid-glass-renderer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 9999; /* Should be on top of everything but let events pass through? Or maybe below materials? */
  /* Actually, the renderer draws the glass effect, so it should probably be on top,
     but we need to make sure it doesn't block interactions with underlying elements
     unless it's the glass material itself handling interactions.
     Wait, the plan says "The Bridge" layer.
     Usually, the glass effect is applied ON the material component.
     But here we have a single renderer manager.
     Maybe this canvas is just for debug or global effects?
     Ah, the plan says "LiquidRendererManager... responsible for setting Scene, Camera, Renderer".
     And "LiquidGlassMaterial... gets WebGL rendering instance".

     If we use Three.js, we might have one canvas for the whole screen and render scenes there?
     Or each material has its own canvas?
     "Phase 2.1: Backdrop Layer... Root container... Provides LiquidManager Context".

     Let's assume for now this canvas is the main rendering surface if we go with a single-canvas approach.
  */
}
</style>
