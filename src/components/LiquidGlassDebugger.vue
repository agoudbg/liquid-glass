<template>
  <div v-if="visible" class="lg-debugger">
    <header class="lg-debugger__header">
      <div>
        <strong>LiquidGlass Debugger</strong>
        <span class="lg-debugger__subtitle">sources: {{ sources.length }} | materials: {{ materials.length }} | scroll:
          {{ scrollAreas.length }}</span>
      </div>
      <button type="button" class="lg-debugger__button" @click="visible = false">Hide</button>
    </header>

    <section class="lg-debugger__section">
      <div class="lg-debugger__section-title">Sources</div>
      <div v-if="sources.length === 0" class="lg-debugger__empty">No sources registered</div>
      <div v-for="src in sources" :key="src.id" class="lg-debugger__card">
        <div class="lg-debugger__row">
          <span class="lg-debugger__badge">{{ src.type }}</span>
          <span class="lg-debugger__label">{{ src.debugLabel || src.id }}</span>
          <span class="lg-debugger__meta">z: {{ src.zIndex }}</span>
          <span class="lg-debugger__meta">updated: {{ new Date(src.updatedAt).toLocaleTimeString() }}</span>
        </div>
        <div class="lg-debugger__row">
          <span class="lg-debugger__meta">{{ formatRect(src.rect) }}</span>
        </div>
        <div v-if="src.previewUrl" class="lg-debugger__preview">
          <img :src="src.previewUrl" alt="preview" />
        </div>
      </div>
    </section>

    <section class="lg-debugger__section">
      <div class="lg-debugger__section-title">Materials</div>
      <div v-if="materials.length === 0" class="lg-debugger__empty">No materials registered</div>
      <div v-for="mat in materials" :key="mat.id" class="lg-debugger__card">
        <div class="lg-debugger__row">
          <span class="lg-debugger__label">{{ mat.id }}</span>
          <span class="lg-debugger__meta">{{ formatRect(mat.rect) }}</span>
        </div>
        <div class="lg-debugger__row lg-debugger__meta">strength: {{ mat.config.strength }} | borderRadius: {{
          mat.config.borderRadius }} | fallbackBlur: {{ mat.config.fallbackBlur }}</div>
      </div>
    </section>

    <section class="lg-debugger__section">
      <div class="lg-debugger__section-title">Scroll Areas</div>
      <div v-if="scrollAreas.length === 0" class="lg-debugger__empty">No scroll areas</div>
      <div v-for="s in scrollAreas" :key="s.id" class="lg-debugger__card lg-debugger__row">
        <span class="lg-debugger__label">{{ s.id }}</span>
        <span class="lg-debugger__meta">x: {{ s.offset.x.toFixed(0) }}, y: {{ s.offset.y.toFixed(0) }}</span>
      </div>
    </section>
  </div>
  <button v-else type="button" class="lg-debugger__toggle" @click="visible = true">Show LiquidGlass Debugger</button>
</template>

<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
} from 'vue';

import { useLiquidContext } from '../core/LiquidContext';
import type { DebugSnapshot, RegisteredSourceSnapshot } from '../types/liquid';

const props = defineProps<{ intervalMs?: number; initiallyOpen?: boolean }>();

const manager = useLiquidContext();
const visible = ref(props.initiallyOpen ?? false);
const sources = ref<Array<RegisteredSourceSnapshot & { previewUrl?: string }>>([]);
const materials = ref<DebugSnapshot['materials']>([]);
const scrollAreas = ref<DebugSnapshot['scrollAreas']>([]);
const cache = reactive(new Map<string, { updatedAt: number; url?: string }>());
let timer: number | undefined;

const bitmapToDataUrl = async (bitmap: ImageBitmap) => {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(bitmap, 0, 0);
  return canvas.toDataURL('image/png');
};

const formatRect = (rect: { x: number; y: number; width: number; height: number }) => `x:${rect.x.toFixed(1)}, y:${rect.y.toFixed(1)}, w:${rect.width.toFixed(1)}, h:${rect.height.toFixed(1)}`;

const refresh = async () => {
  const snapshot = manager.getDebugSnapshot();
  materials.value = snapshot.materials;
  scrollAreas.value = snapshot.scrollAreas;

  const enrichedSources: Array<RegisteredSourceSnapshot & { previewUrl?: string }> = [];
  for (const src of snapshot.sources) {
    let previewUrl: string | undefined;
    if (src.previewBitmap) {
      const cached = cache.get(src.id);
      if (cached && cached.updatedAt === src.updatedAt) {
        previewUrl = cached.url;
      } else {
        previewUrl = await bitmapToDataUrl(src.previewBitmap);
        cache.set(src.id, { updatedAt: src.updatedAt, url: previewUrl });
      }
    }
    enrichedSources.push({ ...src, previewUrl });
  }

  sources.value = enrichedSources;
};

onMounted(() => {
  void refresh();
  timer = window.setInterval(() => void refresh(), props.intervalMs ?? 800);
});

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
});
</script>

<style scoped>
.lg-debugger {
  position: fixed;
  bottom: 16px;
  right: 16px;
  width: 360px;
  max-height: 80vh;
  overflow: auto;
  padding: 12px;
  border-radius: 12px;
  background: rgba(10, 12, 22, 0.9);
  color: #e6ebff;
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.35);
  z-index: 99999;
  backdrop-filter: blur(12px);
}

.lg-debugger__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.lg-debugger__subtitle {
  display: block;
  font-size: 12px;
  color: #93a1c6;
}

.lg-debugger__button,
.lg-debugger__toggle {
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
}

.lg-debugger__toggle {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 99999;
}

.lg-debugger__section {
  margin-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 8px;
}

.lg-debugger__section-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.lg-debugger__empty {
  font-size: 12px;
  color: #93a1c6;
}

.lg-debugger__card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 6px;
}

.lg-debugger__row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.lg-debugger__badge {
  background: #4da6ff;
  color: #0b0e1a;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.lg-debugger__label {
  font-weight: 600;
}

.lg-debugger__meta {
  font-size: 12px;
  color: #93a1c6;
}

.lg-debugger__preview {
  margin-top: 6px;
  background: #0b0e1a;
  border-radius: 6px;
  overflow: hidden;
}

.lg-debugger__preview img {
  width: 100%;
  display: block;
}
</style>
