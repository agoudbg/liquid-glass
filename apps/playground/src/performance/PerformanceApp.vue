<script setup lang="ts">
import type {
  CustomDrawCallback,
  GlassContext,
} from '@agou/liquid-glass-core';
import {
  LgBackdropCanvas,
  LgBackdropConverter,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-vue';
import { onBeforeUnmount } from 'vue';

import './performance.css';

type PerformanceSceneId = 'S003' | 'S004';

const requestedScene = new URLSearchParams(window.location.search).get('scene');
const scene: PerformanceSceneId = requestedScene === 'S004' ? 'S004' : 'S003';
let stopCaptureEvents = (): void => undefined;
let captureCount = 0;

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

function handleReady(context: GlassContext): void {
  stopCaptureEvents();
  document.documentElement.dataset.captureCount = '0';
  stopCaptureEvents = context.on('backdropCaptured', () => {
    captureCount += 1;
    document.documentElement.dataset.captureCount = String(captureCount);
  });
  window.setTimeout(() => {
    document.documentElement.dataset.performanceReady = 'true';
  }, 1_800);
}

function handleError(error: unknown): void {
  if (error instanceof Error) throw error;
  const wrappedError = new Error('Candidate performance context failed.');
  Object.defineProperty(wrappedError, 'cause', { value: error });
  throw wrappedError;
}

onBeforeUnmount(() => stopCaptureEvents());
</script>

<template>
  <main class="oracle-root" :data-scene="scene">
    <section v-if="scene === 'S003'" class="scene-stage">
      <LiquidGlass
        class="oracle-glass"
        :debug="false"
        :render-precision="1"
        render-mode="uniform"
        @error="handleError"
        @ready="handleReady"
      >
        <LgBackdropConverter
          v-slot="{ requestBackdropRedraw }"
          capture-lib="html-to-image"
          :z-index="0"
        >
          <div class="dom-backdrop">
            <div class="dom-stripe stripe-one">Structured DOM</div>
            <div class="dom-stripe stripe-two">Capture parity</div>
            <div class="dom-stripe stripe-three">Text and color</div>
            <button
              data-testid="manual-refresh"
              type="button"
              @click="requestBackdropRedraw"
            >
              Refresh
            </button>
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
        >
          DOM capture
        </LiquidGlassMaterial>
      </LiquidGlass>
    </section>

    <section v-else class="scene-stage">
      <LiquidGlass
        class="oracle-glass"
        :debug="false"
        :render-precision="1"
        render-mode="uniform"
        @error="handleError"
        @ready="handleReady"
      >
        <LgBackdropCanvas :draw="drawBackdrop" :z-index="0" />
        <div class="interaction-row">
          <LiquidGlassMaterial
            class="oracle-material interaction-material"
            data-oracle-material="s004-button"
            data-testid="interaction-button"
            :radius="40"
            interaction-preset="button"
          >
            Button
          </LiquidGlassMaterial>
          <LiquidGlassMaterial
            class="oracle-material interaction-material"
            data-oracle-material="s004-context"
            :radius="40"
            interaction-preset="context-menu"
          >
            Context
          </LiquidGlassMaterial>
          <LiquidGlassMaterial
            class="oracle-material interaction-material"
            data-oracle-material="s004-slider"
            :radius="40"
            interaction-preset="slider"
          >
            Slider
          </LiquidGlassMaterial>
        </div>
      </LiquidGlass>
    </section>
  </main>
</template>
