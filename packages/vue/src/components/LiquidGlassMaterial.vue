<script setup lang="ts">
import type {
  MaterialChanges,
  MaterialConfig,
  MaterialHandle,
} from '@agou/liquid-glass-core';
import { computed, ref, shallowRef, watch } from 'vue';

import { useLiquidGlassContext } from '../composables/liquidGlassContext';
import type {
  LiquidGlassMaterialExposed,
  LiquidGlassMaterialProps,
} from '../types';

defineOptions({
  name: 'LiquidGlassMaterial',
  inheritAttrs: false,
});

const props = withDefaults(defineProps<LiquidGlassMaterialProps>(), {
  radius: 24,
  thickness: 10,
  refractIndex: 1.1,
  refractIntensity: 0.5,
  blur: 0,
  dispersion: 0.01,
  illuminationAngle: 45,
  illuminationIntensity: 0.5,
});

const { context } = useLiquidGlassContext();
const materialElement = ref<HTMLElement | null>(null);
const handle = shallowRef<MaterialHandle | null>(null);
const updating = ref(false);

const materialChanges = computed<MaterialChanges>(() => ({
  radius: props.radius,
  radiusTR: props.radiusTR,
  radiusBR: props.radiusBR,
  radiusBL: props.radiusBL,
  radiusTL: props.radiusTL,
  thickness: props.thickness,
  refractIndex: props.refractIndex,
  refractIntensity: props.refractIntensity,
  blur: props.blur,
  dispersion: props.dispersion,
  disableInteractions: props.disableInteractions,
  onlyClickInteractions: props.onlyClickInteractions,
  interactionPreset: props.interactionPreset,
  interactionConfig: props.interactionConfig,
  renderMode: props.renderMode,
  renderOrder: props.renderOrder,
  proxyTarget: props.proxyTarget,
}));

const materialStyle = computed<Record<string, string>>(() => {
  const radius = props.radius;
  const radii = [
    props.radiusTL ?? radius,
    props.radiusTR ?? radius,
    props.radiusBR ?? radius,
    props.radiusBL ?? radius,
  ];
  return {
    '--lg-border-radius': radii.map((value) => `${value}px`).join(' '),
    '--lg-background-tint': props.useCustomColor
      ? (props.backgroundColor ?? 'transparent')
      : 'rgba(255, 255, 255, 0.12)',
    '--lg-illumination-angle': `${props.illuminationAngle}deg`,
    '--lg-illumination-intensity': String(props.illuminationIntensity),
  };
});

watch(
  [context, materialElement],
  ([currentContext, element], _previous, onCleanup) => {
    if (!currentContext || !element) {
      return;
    }

    const config: MaterialConfig = {
      element,
      ...materialChanges.value,
    };
    const registration = currentContext.addMaterial(config);
    handle.value = registration;

    onCleanup(() => {
      registration.destroy();
      if (handle.value === registration) {
        handle.value = null;
      }
    });
  },
  { immediate: true, flush: 'post' },
);

watch(materialChanges, (changes) => {
  handle.value?.update(changes);
}, { deep: true });

function startUpdating(): void {
  updating.value = true;
  handle.value?.refreshLayout();
}

function stopUpdating(): void {
  updating.value = false;
  handle.value?.refreshLayout();
}

const exposed: LiquidGlassMaterialExposed = {
  getHandle: () => handle.value,
  refreshLayout: () => handle.value?.refreshLayout(),
};

defineExpose(exposed);
</script>

<template>
  <div
    ref="materialElement"
    class="liquid-glass-material"
    :style="materialStyle"
    v-bind="$attrs"
  >
    <div class="liquid-glass-background" aria-hidden="true" />
    <div class="liquid-glass-highlight" aria-hidden="true" />
    <div class="liquid-glass-content">
      <slot
        :updating="updating"
        :start-updating="startUpdating"
        :stop-updating="stopUpdating"
      />
    </div>
  </div>
</template>
