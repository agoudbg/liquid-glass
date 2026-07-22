<script setup lang="ts">
import type { GlassContext, GlassContextOptions } from '@agou/liquid-glass-core';
import { GlassEngine } from '@agou/liquid-glass-core';
import {
  computed,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  shallowRef,
  watch,
} from 'vue';

import { LIQUID_GLASS_CONTEXT_KEY } from '../composables/liquidGlassContext';
import type { LiquidGlassExposed, LiquidGlassProps } from '../types';

defineOptions({
  name: 'LiquidGlass',
  inheritAttrs: false,
});

const props = withDefaults(defineProps<LiquidGlassProps>(), {
  debug: undefined,
  enableBlurredEffect: undefined,
  scrollable: undefined,
});
const emit = defineEmits<{
  /** Emitted after the core context has mounted. */
  ready: [context: GlassContext];
  /** Emitted when context creation fails. */
  error: [error: unknown];
}>();

const container = ref<HTMLElement | null>(null);
const context = shallowRef<GlassContext | null>(null);
let ownedEngine: GlassEngine | null = null;

provide(LIQUID_GLASS_CONTEXT_KEY, { context });

const contextOptions = computed<GlassContextOptions>(() => {
  const options: GlassContextOptions = {
    ...props.options,
    themeColorThresholds: props.options?.themeColorThresholds
      ? { ...props.options.themeColorThresholds }
      : undefined,
  };
  if (props.debug !== undefined) options.debug = props.debug;
  if (props.enableBlurredEffect !== undefined) {
    options.enableBlurredEffect = props.enableBlurredEffect;
  }
  if (props.renderMode !== undefined) options.renderMode = props.renderMode;
  if (props.renderPrecision !== undefined) {
    options.renderPrecision = props.renderPrecision;
  }
  if (props.scrollable !== undefined) options.scrollable = props.scrollable;
  if (props.themeColorThresholds !== undefined) {
    options.themeColorThresholds = { ...props.themeColorThresholds };
  }
  if (props.zIndex !== undefined) options.canvasZIndex = props.zIndex - 1;
  return options;
});

onMounted(() => {
  if (!container.value) {
    return;
  }

  const ownsEngine = !props.engine;
  const engine = props.engine ?? new GlassEngine();
  let mountedContext: GlassContext;
  try {
    mountedContext = engine.createContext(container.value, contextOptions.value);
  } catch (error: unknown) {
    if (ownsEngine) engine.destroy();
    emit('error', error);
    return;
  }

  if (ownsEngine) ownedEngine = engine;
  context.value = mountedContext;
  emit('ready', mountedContext);
});

watch(contextOptions, (options) => {
  context.value?.updateOptions(options);
}, { deep: true });

onBeforeUnmount(() => {
  context.value?.destroy();
  context.value = null;
  ownedEngine?.destroy();
  ownedEngine = null;
});

const exposed: LiquidGlassExposed = {
  getContext: () => context.value,
  refresh: () => context.value?.refresh(),
  refreshVisibility: () => context.value?.refresh('visibility'),
  getProxyTarget: () => context.value?.createProxyInterface() ?? null,
};

defineExpose(exposed);
</script>

<template>
  <div
    ref="container"
    class="liquid-glass-container"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>
