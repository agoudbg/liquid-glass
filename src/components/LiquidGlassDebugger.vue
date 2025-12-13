<template>
  <div class="liquid-glass-debugger">
    <h2>Liquid Glass Debugger</h2>
    <h3>Current Backdrop Canvas</h3>
    <img :src="currentBackdrop" alt="Backdrop Canvas" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { useLiquidContext } from '../core/LiquidContext';

const props = defineProps<{
  initiallyOpen?: boolean;
}>();

const currentBackdrop = ref<string>('');

onMounted(() => {
  const manager = useLiquidContext();

  manager.setOptions({ debug: true });

  manager.on('backdropCaptured', (canvas: OffscreenCanvas) => {
    // Convert OffscreenCanvas to Blob and then to Object URL for display
    canvas.convertToBlob().then((blob) => {
      const url = URL.createObjectURL(blob);
      currentBackdrop.value = url;
    });
  });
});

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
}
</style>
