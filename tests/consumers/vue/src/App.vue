<script setup lang="ts">
import {
  CORE_VERSION,
  LgBackdropConverter,
  LiquidGlass,
  LiquidGlassMaterial,
  VUE_ADAPTER_VERSION,
} from '@agou/liquid-glass-vue';

const resolvedVersions = `adapter ${VUE_ADAPTER_VERSION}, core ${CORE_VERSION}`;
</script>

<template>
  <LiquidGlass
    class="consumer-glass"
    :debug="true"
    :render-precision="1"
  >
    <LgBackdropConverter
      class="consumer-backdrop"
      capture-library="html2canvas"
      :watch-node-changes="false"
      :watch-position-changes="false"
      :watch-resize="false"
    >
      <div class="consumer-backdrop-shape consumer-backdrop-shape-a" />
      <div class="consumer-backdrop-shape consumer-backdrop-shape-b" />
    </LgBackdropConverter>
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
