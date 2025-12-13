<template>
  <canvas ref="canvasRef" class="lg-backdrop-canvas"></canvas>
</template>

<script lang="ts" setup>
// const props = defineProps<{
//   width: number;
//   height: number;
// }>();
</script>

<style scoped>
.lg-backdrop-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
