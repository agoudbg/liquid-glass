<script setup lang="ts">
import type { GlassContext, GlassContextOptions } from '@agou/liquid-glass-core';
import {
  LgBackdropCanvas,
  LgBackdropConverter,
  type LgBackdropConverterExposed,
  LiquidGlass,
} from '@agou/liquid-glass-vue';
import { computed, useTemplateRef, watchEffect } from 'vue';

import {
  getBackdropDraw,
  isDomCaptureState,
  isEditorialDomCaptureState,
  LEGACY_ORACLE_SCROLL_BANDS,
  resolveBackdropBackgroundColor,
  resolveDomCaptureContent,
  resolveViewportCapture,
  SCROLL_BANDS,
  shouldRenderMaterialsBeforeBackdrop,
} from '../../shared/scene-backdrops';
import { isCompositionScene } from '../../shared/composition-scenes';
import { resolveSceneMaterials } from '../../shared/scene-materials';
import { resolveSceneRenderPrecision } from '../../shared/scene-render-options';
import type { FrameworkHostProps } from '../../shared/types';
import VueSceneMaterials from './VueSceneMaterials.vue';
import VueCompositionScene from './VueCompositionScene.vue';

const props = defineProps<FrameworkHostProps>();
const contextOptions = computed<GlassContextOptions>(() => ({
  canvasZIndex: props.state.oracleMode ? 10 : undefined,
  debug: props.state.debugEnabled,
  renderMode: props.state.renderMode,
  renderPrecision: resolveSceneRenderPrecision(props.state),
  scrollable: props.state.scrollable,
}));
const materials = computed(() => resolveSceneMaterials(props.state));
const materialsBeforeBackdrop = computed(
  () => shouldRenderMaterialsBeforeBackdrop(props.state),
);
const domContent = computed(() => resolveDomCaptureContent(props.state.domVariant));
const domScene = computed(() => isDomCaptureState(props.state));
const editorialDomScene = computed(() => isEditorialDomCaptureState(props.state));
const backdropBackgroundColor = computed(
  () => resolveBackdropBackgroundColor(props.state),
);
const viewportCapture = computed(() => resolveViewportCapture(props.state));
const backdropDraw = computed(() => getBackdropDraw(
  props.state.scene,
  props.state.oracleMode,
));
const backdropConverter = useTemplateRef<LgBackdropConverterExposed>('backdropConverter');
const compositionScene = computed(() => isCompositionScene(props.state.scene));

watchEffect((onCleanup) => {
  if (!domScene.value || !backdropConverter.value) {
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

function handleBackdropRefresh(): void {
  void backdropConverter.value?.refresh();
}
</script>

<template>
  <VueCompositionScene
    v-if="compositionScene"
    :callbacks="callbacks"
    :state="state"
  />
  <LiquidGlass
    v-else
    class="glass-context"
    :class="{
      'is-test-mode': state.testMode,
      'is-oracle-mode': state.oracleMode,
    }"
    :data-framework="'vue'"
    :data-glass-enabled="String(state.glassEnabled)"
    :data-lab-source="state.scene === 'S001' ? state.lab.source.kind : undefined"
    :data-scene="state.scene"
    :options="contextOptions"
    @error="handleError"
    @ready="handleReady"
  >
    <VueSceneMaterials
      v-if="materialsBeforeBackdrop"
      :materials="materials"
      :oracle-mode="state.oracleMode"
    />

    <LgBackdropConverter
      v-if="domScene"
      ref="backdropConverter"
      :background-color="backdropBackgroundColor"
      class="scene-backdrop"
      :class="state.oracleMode
        ? 'oracle-backdrop-converter'
        : editorialDomScene
          ? 'dom-capture-backdrop'
          : ['scroll-backdrop', state.scene === 'S005'
            ? 'body-scroll-backdrop'
            : 'internal-scroll-backdrop']"
      :viewport-capture="viewportCapture"
    >
      <div
        v-if="state.oracleMode && state.scene === 'S003'"
        class="oracle-dom-backdrop"
      >
        <div class="oracle-dom-stripe oracle-stripe-one">Structured DOM</div>
        <div class="oracle-dom-stripe oracle-stripe-two">Capture parity</div>
        <div class="oracle-dom-stripe oracle-stripe-three">Text and color</div>
        <button
          data-testid="manual-refresh"
          type="button"
          @click="handleBackdropRefresh"
        >
          Refresh
        </button>
      </div>
      <div
        v-else-if="state.oracleMode"
        class="oracle-long-backdrop"
        :class="state.scene === 'S005'
          ? 'oracle-body-backdrop'
          : 'oracle-internal-backdrop'"
      >
        <div
          v-for="index in LEGACY_ORACLE_SCROLL_BANDS"
          :key="index"
          class="oracle-scroll-band"
        >
          <strong>
            {{ state.scene === 'S005' ? 'Body' : 'Internal' }} band {{ index }}
          </strong>
          <span v-if="state.scene === 'S005'">
            {{ index % 2 === 0 ? 'cool field' : 'warm field' }}
          </span>
          <span v-else>
            {{ index % 2 === 0 ? 'north' : 'south' }}
          </span>
        </div>
      </div>
      <template v-else-if="editorialDomScene">
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

    <VueSceneMaterials
      v-if="!materialsBeforeBackdrop"
      :materials="materials"
      :oracle-mode="state.oracleMode"
    />
  </LiquidGlass>
</template>
