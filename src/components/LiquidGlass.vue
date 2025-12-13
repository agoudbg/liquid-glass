<template>
  <div class="liquid-glass-container" ref="container">
    <slot></slot>
  </div>
</template>

<script lang="ts" setup>

import { onMounted, ref } from 'vue';

import { provideLiquidContext } from '../core/LiquidContext';
import { LiquidRendererManager } from '../core/LiquidRendererManager';

const props = defineProps<{
  debug?: boolean;
  backgroundColor?: string;
  backgroundImage?: string;
}>();

// Initialize the LiquidRendererManager
const manager: LiquidRendererManager = new LiquidRendererManager({ debug: props.debug ?? false });

provideLiquidContext(manager);

const container = ref<HTMLElement | null>(null);

onMounted(() => {
  // Ensure the container is set
  if (!container.value) {
    console.error('LiquidGlass component requires a container element.');
  }

  // Create a LiquidRendererManager instance
  manager.setOptions(
    // Current element as container
    {
      container: container.value ?? undefined,
      debug: props.debug ?? false,
    },
  );

  // Provide the LiquidContext to child components
});

</script>

<style scoped>
.liquid-glass-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
