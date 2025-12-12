<template>
  <div class="liquid-glass-material" ref="el" @mousedown="onMouseDown">
    <slot></slot>
    <!-- Fallback layer if WebGL is not supported -->
    <div v-if="!isSupported" class="fallback-layer" :style="fallbackStyle"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { useLiquidContext } from '../core/LiquidContext';
import { isWebGLSupported } from '../utils/featureDetect';

const props = defineProps<{
  strength?: number;
  borderRadius?: string;
  fallbackBlur?: string;
}>();

const el = ref<HTMLElement | null>(null);
const manager = useLiquidContext();
const isSupported = ref(isWebGLSupported());

const fallbackStyle = computed(() => ({
  backdropFilter: `blur(${props.fallbackBlur || '10px'})`,
  borderRadius: props.borderRadius || '0px',
}));

const onMouseDown = (e: MouseEvent) => {
  if (!el.value) return;

  const rect = el.value.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  manager.triggerRipple({ x, y, timestamp: Date.now() });
};

onMounted(() => {
  if (!el.value) return;

  manager.registerMaterial(el.value, {
    strength: props.strength ?? 1,
    borderRadius: props.borderRadius || '0px',
    fallbackBlur: props.fallbackBlur || '10px',
    shapePath: undefined,
  });
});
</script>

<style scoped>
.liquid-glass-material {
  position: relative;
  overflow: hidden; /* Ensure content respects border radius */
}

.fallback-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: -1; /* Behind content */
}
</style>
