<template>
  <div class="liquid-glass-debugger-layer" v-if="showBackdropDebugLayer">
    <img :src="currentBackdrop" class="current-backdrop">
    <div class="backdrop-labels labels" v-if="showBackdropDebugLabels">
      <div v-for="(element, index) in backdropElements" :key="index" class="backdrop-label label-base"
        :style="getLabelStyle(element as LiquidRendererBackdropElement, 'backdrop')">
        Backdrop {{ index + 1 }}
      </div>
    </div>
    <div class="material-labels labels" v-if="showBackdropDebugLabels">
      <div v-for="(element, index) in materialElements" :key="index" class="material-label label-base"
        :style="getLabelStyle(element as LiquidRendererMaterialElement, 'material')">
        Material {{ index + 1 }}
      </div>
    </div>
  </div>
  <div class="liquid-glass-debugger">
    <h2>Liquid Glass Debugger</h2>
    <p>Efficient Mode: {{ manager?.powerEfficientMode }}</p>
    <p>Fallback Mode: {{ isFallbackMode }}</p>
    <p>Render Mode: {{ manager?.renderMode }}</p>
    <label>
      <input type="checkbox" v-model="showBackdropDebugLayer" />
      Show Backdrop Debug Layer
    </label>
    <label v-if="showBackdropDebugLayer">
      <input type="checkbox" v-model="showBackdropDebugLabels" />
      Show Backdrop Debug Labels
    </label>
    <h3>Current Materials Canvas
      <button @click="getMaterialsCanvas()">Refresh</button>
    </h3>
    <canvas ref="materialsCanvasRef" :width="backdropInfo?.width || 0" :height="backdropInfo?.height || 0"
      style="width: 100%; background: #eee;"></canvas>

    <h3>Current Backdrop Canvas</h3>
    <img :src="currentBackdrop" alt="Backdrop Canvas" width="100%" />
    <p>Width: {{ backdropInfo?.width }}</p>
    <p>Height: {{ backdropInfo?.height }}</p>

    <h3>Backdrop Elements</h3>
    <div v-if="backdropInfo">
      <div v-for="(element, index) in backdropElements" :key="index">
        <p>Element {{ index + 1 }}:</p>
        <img :src="getBackdropElementCanvas(index)" alt="Backdrop Element" width="100%" />
        <p>Position: ({{ element.position.x }}, {{ element.position.y }})</p>
        <p>Size: {{ element.size.width }} x {{ element.size.height }}</p>
        <hr />
      </div>
    </div>

    <h3>Material Elements</h3>
    <div v-if="materialElements.length > 0">
      <div v-for="(element, index) in materialElements" :key="index">
        <p>Material Element {{ index + 1 }}:</p>
        <p>Position: ({{ element.position.x }}, {{ element.position.y }})</p>
        <p>Size: {{ element.size.width }} x {{ element.size.height }}</p>
        <hr />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

import { useLiquidContext } from '../core/LiquidContext';
import { LiquidRendererBackdropElement } from '../core/LiquidRendererBackdropElement';
import { LiquidRendererManager } from '../core/LiquidRendererManager';
import { LiquidRendererMaterialElement } from '../core/LiquidRendererMaterialElement';
import { LiquidRendererBackdropCapturedEvent } from '../types/LiquidGlass';

const props = defineProps<{
  /** Whether the debugger panel should be open by default */
  initiallyOpen?: boolean;
}>();

const manager = ref<LiquidRendererManager | null>(null);

const isFallbackMode = ref<boolean>(false);

const materialsCanvasRef = ref<HTMLCanvasElement | null>(null);

const backdropInfo = ref<LiquidRendererBackdropCapturedEvent | null>(null);
const currentBackdrop = ref<string>('');

const backdropElements = ref<LiquidRendererBackdropElement[]>([]);
const backdropElementUrls = ref<Record<number, string>>({});

const materialElements = ref<LiquidRendererMaterialElement[]>([]);

const showBackdropDebugLayer = ref<boolean>(props.initiallyOpen ?? false);
const showBackdropDebugLabels = ref<boolean>(true);

const LABEL_COLORS: Record<'backdrop' | 'material', string> = {
  backdrop: 'red',
  material: 'blue',
};

const getLabelStyle = (
  element: LiquidRendererBackdropElement | LiquidRendererMaterialElement,
  type: 'backdrop' | 'material',
) => {
  const color = LABEL_COLORS[type];

  // Use a CSS variable for color so the visual differences are minimal and centralized
  return {
    top: `${element.position.y}px`,
    left: `${element.position.x}px`,
    width: `${element.size.width / (window.devicePixelRatio || 1) - 4}px`,
    height: `${element.size.height / (window.devicePixelRatio || 1) - 4}px`,
    // CSS variable consumed by .label-base
    '--label-color': color,
  } as Record<string, string>;
};

const safeConvertToUrl = async (
  canvas?: OffscreenCanvas | HTMLCanvasElement | null,
): Promise<string> => {
  if (!canvas || typeof (canvas as OffscreenCanvas).convertToBlob !== 'function') return '';

  try {
    // Ensure a rendering context exists; OffscreenCanvas requires one for convertToBlob.
    if ('getContext' in canvas && typeof canvas.getContext === 'function') {
      canvas.getContext('2d');
    }

    const blob = await (canvas as OffscreenCanvas).convertToBlob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.warn('LiquidGlassDebugger: failed to convert canvas', error);
    return '';
  }
};

const setBackdropElementUrl = async (index: number, canvas?: OffscreenCanvas | HTMLCanvasElement | null) => {
  const url = await safeConvertToUrl(canvas);

  if (url === backdropElementUrls.value[index]) return;

  const prev = backdropElementUrls.value[index];
  if (prev) URL.revokeObjectURL(prev);

  backdropElementUrls.value = {
    ...backdropElementUrls.value,
    [index]: url,
  };
};

const cleanupRemovedElementUrls = (nextLength: number) => {
  Object.keys(backdropElementUrls.value).forEach((key) => {
    const idx = Number(key);
    if (idx >= nextLength) {
      const prev = backdropElementUrls.value[idx];
      if (prev) URL.revokeObjectURL(prev);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [idx]: _, ...rest } = backdropElementUrls.value;
      backdropElementUrls.value = rest;
    }
  });
};

const getBackdropElementCanvas = (i: number) => backdropElementUrls.value[i] ?? '';

const getMaterialsCanvas = () => {
  if (!materialsCanvasRef.value) return;
  const { materialsCanvas } = manager.value!;
  const ctx = materialsCanvasRef.value.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, materialsCanvasRef.value.width, materialsCanvasRef.value.height);
    ctx.drawImage(materialsCanvas, 0, 0, materialsCanvasRef.value.width, materialsCanvasRef.value.height);
  }
};

onMounted(() => {
  manager.value = useLiquidContext();

  manager.value.setOptions({ debug: true });

  isFallbackMode.value = manager.value.isFallbackMode;
  manager.value.on('fallbackModeChanged', (fallback: boolean) => {
    isFallbackMode.value = fallback;
  });

  manager.value.on('backdropCaptured', async (event: LiquidRendererBackdropCapturedEvent) => {
    const nextUrl = await safeConvertToUrl(event.canvas);
    if (currentBackdrop.value && currentBackdrop.value !== nextUrl) {
      URL.revokeObjectURL(currentBackdrop.value);
    }
    currentBackdrop.value = nextUrl;

    backdropInfo.value = event;
  });

  backdropElements.value = manager.value.registeredBackdropElements;
  manager.value.on('backdropElementChanged', (elements: LiquidRendererBackdropElement[]) => {
    backdropElements.value = elements;
  });

  materialElements.value = manager.value.registeredMaterialElements;
  manager.value.on('materialElementChanged', (elements: LiquidRendererMaterialElement[]) => {
    materialElements.value = elements;
  });

  manager.value.on('materialsRendered', () => {
    getMaterialsCanvas();
  });
});

watch(
  backdropElements,
  (elements) => {
    elements.forEach((element, index) => {
      setBackdropElementUrl(index, element.canvas);
    });

    cleanupRemovedElementUrls(elements.length);
  },
  { immediate: true },
);

</script>

<style scoped>
.liquid-glass-debugger {
  position: fixed;
  bottom: 0;
  right: 0;
  width: 300px;
  max-height: 400px;
  overflow: auto;
  background: #ffffffe6;
  color: #000;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px #0000001a;
  font-size: smaller;
}

img {
  background: #eee;
}

.liquid-glass-debugger-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10086;
  pointer-events: none;
}

.liquid-glass-debugger-layer .current-backdrop {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.6;
}

.label-base {
  position: absolute;
  font-size: 12px;
  pointer-events: none;
  color: var(--label-color);
  border: 2px solid var(--label-color);
}
</style>
