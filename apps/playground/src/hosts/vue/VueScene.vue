<script setup lang="ts">
import type { GlassContext, GlassContextOptions } from '@agou/liquid-glass-core';
import {
  LgBackdropCanvas,
  LgBackdropConverter,
  type LgBackdropConverterExposed,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-vue';
import { computed, useTemplateRef, watchEffect } from 'vue';

import {
  getBackdropDraw,
  isDomCaptureScene,
  resolveDomCaptureContent,
  resolveViewportCapture,
  SCROLL_BANDS,
} from '../../shared/scene-backdrops';
import { resolveSceneMaterials } from '../../shared/scene-materials';
import type { FrameworkHostProps } from '../../shared/types';

const props = defineProps<FrameworkHostProps>();
const contextOptions = computed<GlassContextOptions>(() => ({
  canvasZIndex: props.state.oracleMode ? 10 : undefined,
  renderMode: props.state.renderMode,
  renderPrecision: props.state.renderPrecision,
  scrollable: props.state.scrollable,
}));
const materials = computed(() => resolveSceneMaterials(props.state));
const domContent = computed(() => resolveDomCaptureContent(props.state.domVariant));
const domScene = computed(() => isDomCaptureScene(props.state.scene));
const viewportCapture = computed(() => resolveViewportCapture(props.state));
const backdropDraw = computed(() => getBackdropDraw(
  props.state.scene,
  props.state.oracleMode,
));
const backdropConverter = useTemplateRef<LgBackdropConverterExposed>('backdropConverter');

watchEffect((onCleanup) => {
  if (!isDomCaptureScene(props.state.scene) || !backdropConverter.value) {
    props.callbacks.onBackdropRefreshReady(null);
    return;
  }
  props.callbacks.onBackdropRefreshReady(() => backdropConverter.value?.refresh());
  onCleanup(() => props.callbacks.onBackdropRefreshReady(null));
});

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
    <LgBackdropConverter
      v-if="domScene"
      ref="backdropConverter"
      background-color="#dce4df"
      class="scene-backdrop"
      :class="state.scene === 'S003'
        ? 'dom-capture-backdrop'
        : ['scroll-backdrop', state.scene === 'S005'
          ? 'body-scroll-backdrop'
          : 'internal-scroll-backdrop']"
      :viewport-capture="viewportCapture"
    >
      <template v-if="state.scene === 'S003'">
        <div class="dom-capture-photo">
          <img
            alt="Boats crossing a turquoise alpine lake below the Dolomites"
            data-testid="dom-capture-image"
            :draggable="false"
            src="/dolomites.jpg"
          >
          <span>IMG / LOCAL ASSET</span>
        </div>
        <article
          :key="state.domVariant"
          class="dom-capture-copy"
          :class="domContent.phaseClass"
          :data-dom-phase="state.domVariant"
          data-testid="dom-capture-copy"
        >
          <p>{{ domContent.eyebrow }}</p>
          <h3>{{ domContent.title }}</h3>
          <span>{{ domContent.description }}</span>
          <div
            class="dom-capture-swatches"
            aria-hidden="true"
          >
            <i /><i /><i />
          </div>
          <small>Pietro De Grandi / Unsplash</small>
        </article>
      </template>
      <div
        v-else
        class="scroll-band-grid"
        data-testid="scroll-band-grid"
      >
        <section
          v-for="band in SCROLL_BANDS"
          :key="band.id"
          class="scroll-band"
          :class="`tone-${band.tone}`"
        >
          <span>{{ state.scene === 'S005' ? 'BODY' : 'INTERNAL' }} {{ band.id }}</span>
          <strong>{{ band.title }}</strong>
          <small>{{ band.detail }}</small>
        </section>
      </div>
    </LgBackdropConverter>
    <LgBackdropCanvas
      v-else
      class="scene-backdrop"
      :draw="backdropDraw"
    />

    <LiquidGlassMaterial
      v-for="(material, index) in materials"
      :key="material.id"
      v-bind="material.options"
      :class="material.className"
      :data-interaction-preset="material.options.interactionPreset"
      :data-material-id="material.id"
      :data-oracle-material="state.oracleMode ? material.id : undefined"
      :data-testid="material.testId ?? (index === 0 ? 'primary-material' : undefined)"
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
