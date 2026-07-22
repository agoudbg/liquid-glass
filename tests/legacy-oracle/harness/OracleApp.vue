<script setup lang="ts">
import './oracle.css';

import { nextTick, onMounted } from 'vue';

import LgBackdropCanvas from '../components/LgBackdropCanvas.vue';
import LgBackdropConverter from '../components/LgBackdropConverter.vue';
import LiquidGlass from '../components/LiquidGlass.vue';
import LiquidGlassMaterial from '../components/LiquidGlassMaterial.vue';
import type { CustomDrawCallback } from '../types/LiquidGlass';

type ScenarioId = 'S001' | 'S002' | 'S003' | 'S004' | 'S005' | 'S006';

interface OracleCanvasMetadata {
  className: string;
  width: number;
  height: number;
  rect: DOMRectJSON;
}

interface DOMRectJSON {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface OracleMaterialMetadata {
  id: string;
  rect: DOMRectJSON;
}

interface LegacyOracleControl {
  getMetadata(): {
    scene: ScenarioId;
    devicePixelRatio: number;
    scrollX: number;
    scrollY: number;
    canvases: OracleCanvasMetadata[];
    materials: OracleMaterialMetadata[];
  };
  setGlassEnabled(enabled: boolean): void;
}

declare global {
  interface Window {
    __LEGACY_ORACLE_READY__?: boolean;
    __legacyOracle?: LegacyOracleControl;
  }
}

const requestedScene = new URLSearchParams(window.location.search).get('scene');
const scenarioIds: ScenarioId[] = ['S001', 'S002', 'S003', 'S004', 'S005', 'S006'];
const scene: ScenarioId = scenarioIds.includes(requestedScene as ScenarioId)
  ? requestedScene as ScenarioId
  : 'S001';

const drawBackdrop: CustomDrawCallback = (context, width, height) => {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#f0c65b');
  gradient.addColorStop(0.38, '#db4b55');
  gradient.addColorStop(0.7, '#227f8f');
  gradient.addColorStop(1, '#15263d');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const cellSize = 72;
  for (let y = 0; y < height + cellSize; y += cellSize) {
    for (let x = 0; x < width + cellSize; x += cellSize) {
      context.fillStyle = (x / cellSize + y / cellSize) % 2 === 0
        ? 'rgba(255, 255, 255, 0.18)'
        : 'rgba(3, 11, 24, 0.16)';
      context.fillRect(x, y, cellSize, cellSize);
    }
  }
};

function rectToJSON(rect: DOMRect): DOMRectJSON {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  };
}

function setGlassEnabled(enabled: boolean): void {
  document.querySelectorAll('canvas').forEach((canvas) => {
    canvas.style.visibility = enabled ? 'visible' : 'hidden';
  });
  document.querySelector('.oracle-root')?.classList.toggle('oracle-glass-disabled', !enabled);
}

function getMetadata(): ReturnType<LegacyOracleControl['getMetadata']> {
  const canvases = Array.from(document.querySelectorAll('canvas')).map((canvas) => ({
    className: canvas.className,
    width: canvas.width,
    height: canvas.height,
    rect: rectToJSON(canvas.getBoundingClientRect()),
  }));
  const materials = Array.from(document.querySelectorAll<HTMLElement>('[data-oracle-material]'))
    .map((element) => ({
      id: element.dataset.oracleMaterial ?? 'unknown',
      rect: rectToJSON(element.getBoundingClientRect()),
    }));

  return {
    scene,
    devicePixelRatio: window.devicePixelRatio,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    canvases,
    materials,
  };
}

onMounted(async () => {
  await nextTick();
  await document.fonts.ready;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  window.__legacyOracle = { getMetadata, setGlassEnabled };

  // Legacy capture and first WebGL composition are asynchronous and have no readiness event.
  window.setTimeout(() => {
    window.__LEGACY_ORACLE_READY__ = true;
  }, 1800);
});
</script>

<template>
  <main class="oracle-root" :data-scene="scene">
    <section v-if="scene === 'S001'" class="scene-stage">
      <LiquidGlass class="oracle-glass" :render-precision="1" render-mode="uniform">
        <LgBackdropCanvas :draw="drawBackdrop" :z-index="0" />
        <LiquidGlassMaterial
          class="oracle-material s001-material"
          data-oracle-material="s001-main"
          :radius="52"
          :thickness="18"
          :refract-index="1.18"
          :refract-intensity="0.72"
          :blur="0.018"
          :dispersion="0.018"
          :disable-interactions="true"
        >
          <strong>Static glass</strong>
          <span>Custom canvas backdrop</span>
        </LiquidGlassMaterial>
      </LiquidGlass>
    </section>

    <section v-else-if="scene === 'S002'" class="scene-stage">
      <LiquidGlass class="oracle-glass" :render-precision="1" render-mode="uniform">
        <LgBackdropCanvas :draw="drawBackdrop" :z-index="0" />
        <LiquidGlassMaterial
          class="oracle-material multi-material multi-a"
          data-oracle-material="s002-a"
          :radius="44"
          :thickness="16"
          :refract-index="1.12"
          :refract-intensity="0.64"
          :dispersion="0.012"
          :render-order="1"
          :disable-interactions="true"
        >Alpha</LiquidGlassMaterial>
        <LiquidGlassMaterial
          class="oracle-material multi-material multi-b"
          data-oracle-material="s002-b"
          :radius="28"
          :radius-t-r="64"
          :radius-b-l="64"
          :thickness="24"
          :refract-index="1.24"
          :refract-intensity="0.82"
          :blur="0.025"
          :dispersion="0.024"
          :render-order="3"
          :disable-interactions="true"
        >Beta</LiquidGlassMaterial>
        <LiquidGlassMaterial
          class="oracle-material multi-material multi-c"
          data-oracle-material="s002-c"
          :radius="80"
          :thickness="12"
          :refract-index="1.08"
          :refract-intensity="0.52"
          :render-order="2"
          :disable-interactions="true"
        >Gamma</LiquidGlassMaterial>
      </LiquidGlass>
    </section>

    <section v-else-if="scene === 'S003'" class="scene-stage">
      <LiquidGlass class="oracle-glass" :render-precision="1" render-mode="uniform">
        <LgBackdropConverter v-slot="{ requestBackdropRedraw }" capture-lib="html-to-image" :z-index="0">
          <div class="dom-backdrop">
            <div class="dom-stripe stripe-one">Structured DOM</div>
            <div class="dom-stripe stripe-two">Capture parity</div>
            <div class="dom-stripe stripe-three">Text and color</div>
            <button
              data-testid="manual-refresh"
              type="button"
              @click="requestBackdropRedraw"
            >Refresh</button>
          </div>
        </LgBackdropConverter>
        <LiquidGlassMaterial
          class="oracle-material s003-material"
          data-oracle-material="s003-main"
          :radius="36"
          :thickness="20"
          :refract-index="1.2"
          :refract-intensity="0.76"
          :blur="0.022"
          :dispersion="0.016"
          :disable-interactions="true"
        >DOM capture</LiquidGlassMaterial>
      </LiquidGlass>
    </section>

    <section v-else-if="scene === 'S004'" class="scene-stage">
      <LiquidGlass class="oracle-glass" :render-precision="1" render-mode="uniform">
        <LgBackdropCanvas :draw="drawBackdrop" :z-index="0" />
        <div class="interaction-row">
          <LiquidGlassMaterial
            class="oracle-material interaction-material"
            data-oracle-material="s004-button"
            data-testid="interaction-button"
            :radius="40"
            interaction-preset="button"
          >Button</LiquidGlassMaterial>
          <LiquidGlassMaterial
            class="oracle-material interaction-material"
            data-oracle-material="s004-context"
            :radius="40"
            interaction-preset="context-menu"
          >Context</LiquidGlassMaterial>
          <LiquidGlassMaterial
            class="oracle-material interaction-material"
            data-oracle-material="s004-slider"
            :radius="40"
            interaction-preset="slider"
          >Slider</LiquidGlassMaterial>
        </div>
      </LiquidGlass>
    </section>

    <section v-else-if="scene === 'S005'" class="body-scroll-scene">
      <LiquidGlass class="oracle-glass body-scroll-glass" :render-precision="1" render-mode="uniform">
        <LgBackdropConverter capture-lib="html-to-image" :z-index="0">
          <div class="long-backdrop body-backdrop">
            <div v-for="index in 12" :key="index" class="scroll-band">
              <strong>Body band {{ index }}</strong>
              <span>{{ index % 2 === 0 ? 'cool field' : 'warm field' }}</span>
            </div>
          </div>
        </LgBackdropConverter>
        <LiquidGlassMaterial
          class="oracle-material body-sticky-material"
          data-oracle-material="s005-sticky"
          :radius="34"
          :thickness="19"
          :refract-index="1.16"
          :refract-intensity="0.7"
          :disable-interactions="true"
        >Body scroll</LiquidGlassMaterial>
      </LiquidGlass>
    </section>

    <section v-else class="scene-stage internal-stage">
      <LiquidGlass
        class="oracle-glass internal-scroll-glass"
        :render-precision="1"
        render-mode="uniform"
        scrollable
      >
        <LiquidGlassMaterial
          class="oracle-material internal-sticky-material"
          data-oracle-material="s006-sticky"
          :radius="34"
          :thickness="19"
          :refract-index="1.16"
          :refract-intensity="0.7"
          :disable-interactions="true"
        >Internal scroll</LiquidGlassMaterial>
        <LgBackdropConverter
          capture-lib="html-to-image"
          :viewport-capture="{ enabled: true, bufferY: 180, bufferX: 0 }"
          :z-index="0"
        >
          <div class="long-backdrop internal-backdrop">
            <div v-for="index in 12" :key="index" class="scroll-band">
              <strong>Internal band {{ index }}</strong>
              <span>{{ index % 2 === 0 ? 'north' : 'south' }}</span>
            </div>
          </div>
        </LgBackdropConverter>
      </LiquidGlass>
    </section>
  </main>
</template>
