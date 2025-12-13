<template>
  <div class="multi-glass-demo">
    <canvas ref="canvasRef" class="demo-canvas"></canvas>
    <div class="info-panel">
      <h3>Multi-Glass Demo</h3>
      <p>Three glass regions with different properties rendered on a single canvas</p>
      <small>Each glass has unique refraction, thickness, and corner radii</small>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

import bgImageSrc from '../assets/pietro-de-grandi-T7K4aEPoGGk-unsplash.jpg';
import { createLiquidGlassRenderer, type LiquidGlassRenderer } from '../core/liquidGlassRenderer';

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderer: LiquidGlassRenderer | null = null;

// Glass configurations for multiple instances
const glassConfigs = [
  {
    id: 'glass-1',
    thickness: 25.0,
    refractIndex: 1.5,
    refractIntensity: 0.8,
    radius: 30.0,
    radiusTR: 30.0,
    radiusBR: 30.0,
    radiusBL: 30.0,
    radiusTL: 30.0,
    width: 0.2,
    height: 0.2,
    foregroundColor: [0.1, 0.1, 0.2, 0.05] as [number, number, number, number],
    position: { x: 0.25, y: 0.3 },
  },
  {
    id: 'glass-2',
    thickness: 35.0,
    refractIndex: 1.6,
    refractIntensity: 1.2,
    radius: 20.0,
    radiusTR: 60.0,
    radiusBR: 10.0,
    radiusBL: 60.0,
    radiusTL: 10.0,
    width: 0.25,
    height: 0.25,
    foregroundColor: [0.2, 0.05, 0.1, 0.08] as [number, number, number, number],
    position: { x: 0.75, y: 0.4 },
  },
  {
    id: 'glass-3',
    thickness: 20.0,
    refractIndex: 1.45,
    refractIntensity: 0.6,
    radius: 50.0,
    width: 0.18,
    height: 0.18,
    foregroundColor: [0.0, 0.1, 0.1, 0.06] as [number, number, number, number],
    position: { x: 0.5, y: 0.7 },
  },
];

function loadBackground(src: string) {
  if (!renderer) return;
  const img = new Image();
  img.onload = () => renderer?.setBackground(img);
  img.src = src;
}

function handleResize() {
  renderer?.resize();
}

onMounted(() => {
  if (!canvasRef.value) return;

  renderer = createLiquidGlassRenderer(canvasRef.value);
  if (!renderer) return;

  // Add all glass materials
  glassConfigs.forEach((config) => {
    renderer!.addMaterial(config.id, {
      thickness: config.thickness,
      refractIndex: config.refractIndex,
      refractIntensity: config.refractIntensity,
      radius: config.radius,
      radiusTR: config.radiusTR,
      radiusBR: config.radiusBR,
      radiusBL: config.radiusBL,
      radiusTL: config.radiusTL,
      width: config.width,
      height: config.height,
      foregroundColor: config.foregroundColor,
    }, config.position);
  });

  loadBackground(bgImageSrc);

  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  renderer?.dispose();
  window.removeEventListener('resize', handleResize);
});
</script>

<style scoped>
.multi-glass-demo {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #1a1a1a;
}

.demo-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.info-panel {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 16px;
  border-radius: 12px;
  font-family: sans-serif;
  font-size: 13px;
  backdrop-filter: blur(10px);
  max-width: 260px;
}

.info-panel h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
}

.info-panel p {
  margin: 0 0 4px 0;
  line-height: 1.4;
}

.info-panel small {
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.3;
  display: block;
  margin-top: 8px;
}
</style>
