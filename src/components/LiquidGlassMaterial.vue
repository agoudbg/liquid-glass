<template>
  <div class="liquid-glass-material" ref="materialElement" :render-mode="renderMode">
    <slot :updating="updating"></slot>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';

import { useLiquidContext } from '../core/LiquidContext';
import { LiquidRendererMaterialElement } from '../core/LiquidRendererMaterialElement';

const props = defineProps<{
  thickness?: number;
  refractIndex?: number;
  refractIntensity?: number;
  radius: number;
  radiusTR?: number;
  radiusBR?: number;
  radiusBL?: number;
  radiusTL?: number;
  blur?: number;
  saturation?: number;
  useAutomaticColor?: boolean;
  backgroundColor?: string;
}>();

const materialElement = ref<HTMLElement | null>(null);
const materialManager = ref<LiquidRendererMaterialElement | null>(null);

// Compute border radius style
const borderRadius = computed(() => {
  const r = props.radius ?? 0;
  const rTR = props.radiusTR ?? r;
  const rBR = props.radiusBR ?? r;
  const rBL = props.radiusBL ?? r;
  const rTL = props.radiusTL ?? r;
  return `${rTL}px ${rTR}px ${rBR}px ${rBL}px`;
});

const manager = useLiquidContext();

const renderMode = computed(() => manager.renderMode);
onMounted(() => {
  console.log('LgMaterialConverter mounted');

  // Register self as a material element
  if (materialElement.value) {
    console.log('LgMaterialConverter: registering material element with manager');
    materialManager.value = new LiquidRendererMaterialElement(manager, materialElement.value, {
      thickness: props.thickness,
      refractIndex: props.refractIndex,
      refractIntensity: props.refractIntensity,
      radius: props.radius,
      radiusTR: props.radiusTR,
      radiusBR: props.radiusBR,
      radiusBL: props.radiusBL,
      radiusTL: props.radiusTL,
      useAutomaticColor: props.useAutomaticColor,
    });
  }
});

// Function to trigger re-rendering of this material
const updating = (duration: number) => {
  if (materialManager.value) {
    const interval = 50;
    const times = Math.floor(duration / interval) + 1;
    let count = 0;
    let isUpdating = false;
    const timer = setInterval(() => {
      if (!isUpdating) {
        isUpdating = true;
        materialManager.value?.sendReRenderRequest();
        isUpdating = false;
        if (count++ >= times) {
          clearInterval(timer);
        }
      }
    }, interval);
  }
};

defineExpose({ updating });

</script>

<style scoped>
.liquid-glass-material {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: v-bind(borderRadius);
  border: 2px solid rgba(255, 255, 255, 0.669);
  overflow: hidden;

  &[render-mode="uniform"] {
    z-index: 10000;
  }
}
</style>
