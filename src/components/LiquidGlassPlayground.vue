<template>
  <div class="liquid-glass-playground">
    <canvas ref="canvasRef" class="gl-canvas"></canvas>

    <div class="control-panel">
      <h3>Liquid Glass</h3>

      <div class="control-group">
        <label>Render Precision: {{ renderPrecision.toFixed(2) }}</label>
        <small>Scales the internal render resolution; higher values improve sharpness at higher GPU cost.</small>
        <input type="range" v-model.number="renderPrecision" min="0.5" max="2.5" step="0.05" />
      </div>

      <div class="control-group">
        <label>Thickness: {{ params.thickness.toFixed(1) }}</label>
        <small>Physical thickness in pixels; higher values produce smoother normals and deeper
          refraction.</small>
        <input type="range" v-model.number="params.thickness" min="1" max="100" step="1" />
      </div>

      <div class="control-group">
        <label>Refract Index: {{ params.refractIndex.toFixed(2) }}</label>
        <small>Index of refraction (IOR); glass is typically ~1.5, water ~1.33.</small>
        <input type="range" v-model.number="params.refractIndex" min="1.0" max="3.0" step="0.01" />
      </div>

      <div class="control-group">
        <label>Intensity: {{ params.refractIntensity.toFixed(2) }}</label>
        <small>Scales the refraction offset; use lower values for subtle distortion.</small>
        <input type="range" v-model.number="params.refractIntensity" min="0.0" max="2.0" step="0.01" />
      </div>

      <div class="control-group">
        <label>Default Corner Radius: {{ params.radius.toFixed(0) }}</label>
        <small>Fallback radius in pixels; individual corners inherit this value unless overridden.</small>
        <input type="range" v-model.number="params.radius" min="0" max="200" step="1" />
      </div>

      <div class="control-group">
        <label>Corner Radius (Top-Right): {{ params.radiusTR.toFixed(0) }}</label>
        <small>Top-right corner radius in pixels.</small>
        <input type="range" v-model.number="params.radiusTR" min="0" max="200" step="1" />
      </div>

      <div class="control-group">
        <label>Corner Radius (Bottom-Right): {{ params.radiusBR.toFixed(0) }}</label>
        <small>Bottom-right corner radius in pixels.</small>
        <input type="range" v-model.number="params.radiusBR" min="0" max="200" step="1" />
      </div>

      <div class="control-group">
        <label>Corner Radius (Bottom-Left): {{ params.radiusBL.toFixed(0) }}</label>
        <small>Bottom-left corner radius in pixels.</small>
        <input type="range" v-model.number="params.radiusBL" min="0" max="200" step="1" />
      </div>

      <div class="control-group">
        <label>Corner Radius (Top-Left): {{ params.radiusTL.toFixed(0) }}</label>
        <small>Top-left corner radius in pixels.</small>
        <input type="range" v-model.number="params.radiusTL" min="0" max="200" step="1" />
      </div>

      <div class="control-group">
        <label>Width (px): {{ params.width.toFixed(0) }}</label>
        <small>Horizontal size in pixels.</small>
        <input type="range" v-model.number="params.width" min="50" max="1000" step="10" />
      </div>

      <div class="control-group">
        <label>Height (px): {{ params.height.toFixed(0) }}</label>
        <small>Vertical size in pixels.</small>
        <input type="range" v-model.number="params.height" min="50" max="1000" step="10" />
      </div>

      <div class="control-group">
        <label>Background Image</label>
        <input type="file" accept="image/*" @change="handleFileUpload" />
      </div>

      <div class="control-group">
        <label>Re-create Renderer</label>
        <button @click="recreateRenderer">Re-create</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  onMounted, onUnmounted, reactive, ref, watch,
} from 'vue';

import bgImageSrc from '../assets/pietro-de-grandi-T7K4aEPoGGk-unsplash.jpg';
import { createLiquidGlassRenderer, type LiquidGlassConfig, type LiquidGlassRenderer } from '../core/liquidGlassRenderer';

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderer: LiquidGlassRenderer | null = null;
const MATERIAL_ID = 'playground-glass';
const renderPrecision = ref(1.0);

/**
 * Interactive parameters for the Liquid Glass demo.
 * - thickness: glass thickness in pixels, affects normal length and refraction spread.
 * - refractIndex: IOR of glass; higher bends light more (typical glass ~1.5).
 * - refractIntensity: multiplier for refraction offset (acts like shader intensity knob).
 * - radiusTR/BR/BL/TL: per-corner radii in pixels to support asymmetric shapes.
 * - width/height: quad size in pixels.
 */
const params = reactive<LiquidGlassConfig>({
  thickness: 30.0,
  refractIndex: 1.5,
  refractIntensity: 1.0,
  blur: 0.0,
  radius: 40.0,
  radiusTR: 40.0,
  radiusBR: 40.0,
  radiusBL: 40.0,
  radiusTL: 40.0,
  width: 400,
  height: 400,
});

const position = reactive({ x: 400, y: 300 });

function handleMouseMove(event: MouseEvent) {
  if (!canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  position.x = x;
  position.y = y;
  renderer?.setMaterialPosition(MATERIAL_ID, position.x, position.y);
}

function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || !renderer) return;

  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(img.src);
    renderer?.setBackground(img);
  };
  img.src = URL.createObjectURL(file);
}
function loadBackground(src: string) {
  if (!renderer) return;
  const img = new Image();
  img.onload = () => renderer?.setBackground(img);
  img.src = src;
}

function handleResize() {
  renderer?.resize();
}

watch(params, (next) => renderer?.updateMaterial(MATERIAL_ID, { ...next }), { deep: true });
watch(renderPrecision, (scale) => renderer?.setRenderScale(scale));

onMounted(() => {
  if (!canvasRef.value) return;
  renderer = createLiquidGlassRenderer(canvasRef.value, { renderScale: renderPrecision.value });
  if (!renderer) return;
  renderer.addMaterial(MATERIAL_ID, { ...params }, position);
  loadBackground(bgImageSrc);
  window.addEventListener('resize', handleResize);
  window.addEventListener('mousemove', handleMouseMove);
});

onUnmounted(() => {
  renderer?.dispose();
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('mousemove', handleMouseMove);
});

function recreateRenderer() {
  if (!canvasRef.value) return;
  renderer?.dispose();
  renderer = createLiquidGlassRenderer(canvasRef.value, { renderScale: renderPrecision.value });
  if (!renderer) return;
  renderer.addMaterial(MATERIAL_ID, { ...params }, position);
  loadBackground(bgImageSrc);
  console.log('Re-created renderer');
}
</script>

<style scoped>
.liquid-glass-playground {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.gl-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.control-panel {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(255, 255, 255, 0.9);
  padding: 16px;
  border-radius: 12px;
  font-family: sans-serif;
  font-size: 13px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  width: 320px;
  height: 500px;
  overflow-y: auto;
}

.control-group {
  margin-bottom: 16px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #333;
}

input[type="range"] {
  width: 100%;
}
</style>
