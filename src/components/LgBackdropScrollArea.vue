<template>
  <div class="lg-backdrop-scroll-area" @scroll="onScroll" ref="scrollEl">
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { useLiquidContext } from '../core/LiquidContext';

const props = defineProps<{ id?: string }>();

const manager = useLiquidContext();
const scrollEl = ref<HTMLElement | null>(null);
const areaId = props.id || crypto.randomUUID();

const onScroll = (e: Event) => {
  const target = e.target as HTMLElement;
  manager.updateScrollArea(areaId, {
    x: target.scrollLeft,
    y: target.scrollTop,
  });
};

onMounted(() => {
  if (scrollEl.value) {
    manager.registerScrollArea(areaId, scrollEl.value);
  }
});

onBeforeUnmount(() => {
  manager.unregisterScrollArea(areaId);
});
</script>

<style scoped>
.lg-backdrop-scroll-area {
  overflow: auto;
  height: 100%;
  width: 100%;
}
</style>
