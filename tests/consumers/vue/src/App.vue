<script setup lang="ts">
import {
  CORE_VERSION,
  LiquidGlass,
  LiquidGlassMaterial,
  VUE_ADAPTER_VERSION,
} from '@agou/liquid-glass-vue';

const resolvedVersions = `adapter ${VUE_ADAPTER_VERSION}, core ${CORE_VERSION}`;
</script>

<template>
  <LiquidGlass>
    <LiquidGlassMaterial :radius="18">
      <main>
        <h1>Vue adapter package loaded</h1>
        <output>{{ resolvedVersions }}</output>
      </main>
    </LiquidGlassMaterial>
  </LiquidGlass>
</template>
