<script setup lang="ts">
import type { CustomDrawCallback } from '@agou/liquid-glass-core';
import {
  CORE_VERSION,
  LgBackdropCanvas,
  LiquidGlass,
  LiquidGlassMaterial,
  VUE_ADAPTER_VERSION,
} from '@agou/liquid-glass-vue';

const resolvedVersions = `adapter ${VUE_ADAPTER_VERSION}, core ${CORE_VERSION}`;

const drawBackdrop: CustomDrawCallback = (context, width, height) => {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#d8e9e2');
  gradient.addColorStop(0.52, '#f4d45f');
  gradient.addColorStop(1, '#e8816d');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(24, 83, 74, 0.32)';
  context.lineWidth = Math.max(1, width / 480);
  for (let x = 0; x < width; x += width / 8) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
};
</script>

<template>
  <LiquidGlass
    class="consumer-glass"
    :debug="true"
    :render-precision="1"
  >
    <LgBackdropCanvas :draw="drawBackdrop" />
    <LiquidGlassMaterial
      class="consumer-material"
      :radius="32"
      :thickness="42"
      :refract-intensity="0.76"
    >
      <main class="consumer-copy">
        <span>PACKED CONSUMER</span>
        <h1>Vue adapter package loaded</h1>
        <output>{{ resolvedVersions }}</output>
      </main>
    </LiquidGlassMaterial>
  </LiquidGlass>
</template>
