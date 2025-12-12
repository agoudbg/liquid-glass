<template>
  <div class="lg-backdrop-scroll-area" @scroll="onScroll">
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { useLiquidContext } from '../core/LiquidContext';

const manager = useLiquidContext();

const onScroll = (e: Event) => {
  const target = e.target as HTMLElement;
  manager.updateScroll({
    x: target.scrollLeft,
    y: target.scrollTop,
  });
};
</script>

<style scoped>
.lg-backdrop-scroll-area {
  overflow: auto;
  height: 100%;
  width: 100%;
}
</style>
