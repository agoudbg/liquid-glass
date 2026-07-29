<script setup lang="ts">
import type {
  GlassContext,
  GlassContextOptions,
} from '@agou/liquid-glass-core';
import {
  LgBackdropCanvas,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-vue';
import {
  computed,
  shallowRef,
} from 'vue';

import {
  createProxyMaterial,
  drawNestedChildBackdrop,
  getCompositionBackdropDraw,
  isCompositionScene,
  type CompositionSceneId,
  resolveCompositionMaterials,
} from '../../shared/composition-scenes';
import { resolveSceneRenderPrecision } from '../../shared/scene-render-options';
import type { FrameworkHostProps } from '../../shared/types';
import VueSceneMaterials from './VueSceneMaterials.vue';

const props = defineProps<FrameworkHostProps>();
const outerContext = shallowRef<GlassContext | null>(null);
const scene = computed<CompositionSceneId>(() => {
  if (!isCompositionScene(props.state.scene)) {
    throw new Error(`Unsupported Composition scene: ${props.state.scene}`);
  }
  return props.state.scene;
});
const outerOptions = computed<GlassContextOptions>(() => ({
  debug: true,
  renderMode: props.state.renderMode,
  renderPrecision: resolveSceneRenderPrecision(props.state),
}));
const auxiliaryOptions = computed<GlassContextOptions>(() => ({
  debug: true,
  renderMode: 'uniform',
  renderPrecision: resolveSceneRenderPrecision(props.state),
}));
const materials = computed(() => resolveCompositionMaterials(scene.value));
const proxyMaterial = computed(() => createProxyMaterial(
  scene.value === 'S010'
    ? outerContext.value?.createProxyInterface()
    : undefined,
));

function handleOuterReady(context: GlassContext): void {
  outerContext.value = context;
  props.callbacks.onContextReady(context);
}

function handleAuxiliaryReady(context: GlassContext): void {
  props.callbacks.onAuxiliaryContextReady?.(context);
}
</script>

<template>
  <LiquidGlass
    class="glass-context composition-context"
    data-framework="vue"
    :data-glass-enabled="String(state.glassEnabled)"
    :data-scene="scene"
    data-testid="composition-scene"
    :options="outerOptions"
    @error="callbacks.onError"
    @ready="handleOuterReady"
  >
    <LgBackdropCanvas
      class="scene-backdrop composition-backdrop"
      :draw="getCompositionBackdropDraw(scene)"
    />

    <template v-if="scene === 'S009'">
      <LiquidGlass
        class="nested-child-context"
        data-testid="nested-child-context"
        :options="auxiliaryOptions"
        @error="callbacks.onError"
        @ready="handleAuxiliaryReady"
      >
        <LgBackdropCanvas
          class="scene-backdrop nested-child-backdrop"
          :draw="drawNestedChildBackdrop"
        />
        <VueSceneMaterials
          :materials="materials.slice(1)"
          :oracle-mode="false"
        />
      </LiquidGlass>
      <VueSceneMaterials
        :materials="materials.slice(0, 1)"
        :oracle-mode="false"
      />
    </template>

    <template v-else-if="scene === 'S010'">
      <div
        class="proxy-target-label"
        aria-hidden="true"
      >
        TARGET CONTEXT
      </div>
      <LiquidGlass
        class="proxy-source-context"
        data-testid="proxy-source-context"
        :options="auxiliaryOptions"
        @error="callbacks.onError"
        @ready="handleAuxiliaryReady"
      >
        <LiquidGlassMaterial
          v-bind="proxyMaterial.options"
          :class="proxyMaterial.className"
          :data-material-id="proxyMaterial.id"
          :data-testid="`composition-material-${proxyMaterial.id}`"
        >
          <div class="material-copy">
            <span>{{ proxyMaterial.label }}</span>
            <strong>{{ proxyMaterial.name }}</strong>
            <small>
              {{ proxyMaterial.options.thickness }} px ·
              {{ proxyMaterial.options.refractIndex?.toFixed(2) }} IOR
            </small>
          </div>
        </LiquidGlassMaterial>
      </LiquidGlass>
    </template>

    <VueSceneMaterials
      v-else
      :materials="materials"
      :oracle-mode="false"
    />
  </LiquidGlass>
</template>
