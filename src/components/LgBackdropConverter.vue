<template>
  <div ref="el" class="lg-backdrop-converter">
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import html2canvas from 'html2canvas';
import {
  nextTick, onBeforeUnmount, onMounted, ref, watch,
} from 'vue';

import { useLiquidContext } from '../core/LiquidContext';

const props = defineProps<{ debounceMs?: number; zIndex?: number; debugLabel?: string }>();

const el = ref<HTMLElement | null>(null);
const manager = useLiquidContext();
const resizeObserver = ref<ResizeObserver | null>(null);
const mutationObserver = ref<MutationObserver | null>(null);
const sourceId = crypto.randomUUID();
let debounceTimer: number | undefined;
let captureInFlight = false;
let pendingCapture = false;

const clearTimer = () => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
};

const scheduleCapture = () => {
  clearTimer();
  const delay = props.debounceMs ?? 120;
  debounceTimer = window.setTimeout(() => {
    void capture();
  }, delay);
};

const capture = async () => {
  if (!el.value) return;
  if (captureInFlight) {
    pendingCapture = true;
    return;
  }
  captureInFlight = true;
  pendingCapture = false;

  try {
    await nextTick();

    const canvas = await html2canvas(el.value, {
      backgroundColor: null,
      logging: false,
    });

    const workerBitmap = await createImageBitmap(canvas);
    const previewBitmap = await createImageBitmap(canvas);
    const rect = el.value.getBoundingClientRect();

    manager.updateTextureMap({
      id: sourceId,
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      imageBitmap: workerBitmap,
      previewBitmap,
      zIndex: props.zIndex ?? 0,
      sourceType: 'converter',
      debugLabel: props.debugLabel,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to capture element:', error);
  } finally {
    captureInFlight = false;
    if (pendingCapture) {
      pendingCapture = false;
      scheduleCapture();
    }
  }
};

onMounted(() => {
  if (!el.value) return;

  manager.registerSource(sourceId, 'converter', props.debugLabel);

  resizeObserver.value = new ResizeObserver(() => scheduleCapture());
  resizeObserver.value.observe(el.value);

  mutationObserver.value = new MutationObserver(() => scheduleCapture());
  mutationObserver.value.observe(el.value, {
    attributes: true, childList: true, subtree: true, characterData: true,
  });

  // Initial capture after layout settles
  setTimeout(() => {
    void capture();
  }, props.debounceMs ?? 120);
});

watch(() => props.debounceMs, () => {
  scheduleCapture();
});

onBeforeUnmount(() => {
  clearTimer();
  resizeObserver.value?.disconnect();
  mutationObserver.value?.disconnect();
  manager.unregisterSource(sourceId);
});
</script>
