<script setup lang="ts">
import type { GlassContext, GlassContextOptions } from '@agou/liquid-glass-core';
import {
  LgBackdropCanvas,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-vue';
import { computed } from 'vue';

import { getBackdropDraw, resolveSceneMaterials } from '../../shared/scenes';
import type { FrameworkHostProps } from '../../shared/types';

const props = defineProps<FrameworkHostProps>();
const contextOptions = computed<GlassContextOptions>(() => ({
  canvasZIndex: props.state.oracleMode ? 10 : undefined,
  renderMode: props.state.renderMode,
  renderPrecision: props.state.renderPrecision,
  scrollable: props.state.scrollable,
}));
const materials = computed(() => resolveSceneMaterials(props.state));
const backdropDraw = computed(() => getBackdropDraw(
  props.state.scene,
  props.state.oracleMode,
));

function handleReady(context: GlassContext): void {
  props.callbacks.onContextReady(context);
}

function handleError(error: unknown): void {
  props.callbacks.onError(error);
}
</script>

<template>
  <LiquidGlass
    class="glass-context"
    :class="{
      'is-test-mode': state.testMode,
      'is-oracle-mode': state.oracleMode,
    }"
    :data-framework="'vue'"
    :data-glass-enabled="String(state.glassEnabled)"
    :data-scene="state.scene"
    :options="contextOptions"
    @error="handleError"
    @ready="handleReady"
  >
    <LgBackdropCanvas
      class="scene-backdrop"
      :draw="backdropDraw"
    />

    <LiquidGlassMaterial
      v-for="(material, index) in materials"
      :key="material.id"
      v-bind="material.options"
      :class="material.className"
      :data-material-id="material.id"
      :data-testid="index === 0 ? 'primary-material' : undefined"
    >
      <div class="material-copy">
        <template v-if="state.oracleMode">
          <strong>{{ material.name }}</strong>
          <span v-if="material.detail">{{ material.detail }}</span>
        </template>
        <template v-else>
          <span>{{ material.label }}</span>
          <strong>{{ material.name }}</strong>
          <small>
            {{ material.options.thickness }} px ·
            {{ material.options.refractIndex?.toFixed(2) }} IOR
          </small>
        </template>
      </div>
    </LiquidGlassMaterial>
  </LiquidGlass>
</template>
