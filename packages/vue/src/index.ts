/**
 * @agou/liquid-glass-vue
 *
 * Vue 3 adapter for @agou/liquid-glass-core.
 *
 * Provides Vue-idiomatic components and composables that wrap the core
 * engine's imperative API. Uses Composition API with `<script setup>`.
 *
 * @packageDocumentation
 */

import './styles/glass.css';

import packageJson from '../package.json';

export { default as LgBackdropCanvas } from './components/LgBackdropCanvas.vue';
export { default as LgBackdropConverter } from './components/LgBackdropConverter.vue';
export { default as LiquidGlass } from './components/LiquidGlass.vue';
export { default as LiquidGlassMaterial } from './components/LiquidGlassMaterial.vue';
export {
  LIQUID_GLASS_CONTEXT_KEY,
  useLiquidGlassContext,
} from './composables/liquidGlassContext';
export type {
  LegacyInteractionConfig,
  LgBackdropCanvasProps,
  LgBackdropConverterExposed,
  LgBackdropConverterProps,
  LgBackdropConverterSlotProps,
  LiquidGlassExposed,
  LiquidGlassInjection,
  LiquidGlassMaterialExposed,
  LiquidGlassMaterialProps,
  LiquidGlassProps,
} from './types';
export { CORE_VERSION } from '@agou/liquid-glass-core';

/**
 * Vue adapter package version.
 */
export const VUE_ADAPTER_VERSION = packageJson.version;
