<template>
  <div class="liquid-glass-material" ref="materialElement" :render-mode="renderMode" :is-fallback-mode="isFallbackMode"
    :allowing-color-transition="allowingColorTransition" :disable-interactions="disableInteractions"
    :only-click-interactions="onlyClickInteractions" :style="materialStyle" @pointerdown="onPointerDown"
    @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" @pointerleave="onPointerLeave">
    <div class="liquid-glass-highlight" v-show="highlightVisible" :style="highlightStyle"></div>
    <slot :updating="updating" :startUpdating="startUpdating" :stopUpdating="stopUpdating"></slot>
  </div>
</template>

<script lang="ts" setup>
import {
  computed, onMounted, onUnmounted, ref,
  watch,
} from 'vue';

import { useLiquidContext } from '../core/LiquidContext';
import { LiquidRendererMaterialElement } from '../core/LiquidRendererMaterialElement';
import { LiquidRendererMaterialElementTransform } from '../types/LiquidGlass';

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
  useCustomColor?: boolean;
  backgroundColor?: string;
  disableInteractions?: boolean;
  onlyClickInteractions?: boolean;
  interaction?: Partial<InteractionConfig>;
}>();

type InteractionConfig = {
  baseScale: number;
  activeScale: number;
  translateFactor: number;
  stretchFactor: number;
  stretchLimit: number;
  damping: number;
  releaseDamping: number;
  reboundDamping: number;
  reboundThreshold: number;
  highlightSize: number;
  highlightOpacity: number;
  highlightHDRFactor: number;
  followLag: number;
};

const defaultInteraction: InteractionConfig = {
  baseScale: 1,
  activeScale: 1.01,
  translateFactor: 0.08,
  stretchFactor: 0.0015,
  stretchLimit: 0.05,
  damping: 0.16,
  releaseDamping: 0.12,
  reboundDamping: 0.1,
  reboundThreshold: 1.5,
  highlightSize: 200,
  highlightOpacity: 0.35,
  highlightHDRFactor: 1.2,
  followLag: 0.15,
};

const interaction = computed<InteractionConfig>(() => ({
  ...defaultInteraction,
  ...(props.interaction ?? {}),
}));

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

const isFallbackMode = ref<boolean>(false);
const onFallbackModeChanged = (fallback: boolean) => {
  isFallbackMode.value = fallback;
};
manager.on('fallbackModeChanged', onFallbackModeChanged);
isFallbackMode.value = manager.isFallbackMode;

const calculatedBackgroundColor = ref(<string>(props.backgroundColor ?? 'initial'));
const calculatedForegroundColor = ref('initial');

const calculatedBoxShadowBackgroundColor = computed(() => '#00000033');

const calculatedBoxShadowInsetBackgroundColor = computed(() => `${calculatedBackgroundColor.value.slice(-2)}33`);

const boxShadowSize = computed(() => '10px');

const boxShadowInsetSize = computed(() => {
  const thickness = materialManager.value?.glassAttributes.thickness ?? 20;
  return `${Math.max(5, thickness)}px`;
});

const allowingColorTransition = ref<boolean | undefined>(undefined);

const updateBackgroundColor = () => {
  if (materialManager.value && !materialManager.value?.options.useCustomColor) {
    const autoBackgroundColorMode = materialManager.value.automaticBackgroundColorMode;
    switch (autoBackgroundColorMode) {
      case 'ultra_light':
        calculatedBackgroundColor.value = '#ffffff33';
        calculatedForegroundColor.value = '#000000';
        break;
      case 'light':
        calculatedBackgroundColor.value = '#ffffff99';
        calculatedForegroundColor.value = '#000000';
        break;
      case 'ultra_dark':
        calculatedBackgroundColor.value = '#00000022';
        calculatedForegroundColor.value = '#ffffff';
        break;
      case 'dark':
        calculatedBackgroundColor.value = '#00000066';
        calculatedForegroundColor.value = '#ffffff';
        break;
      default:
    }
  } else if (props.backgroundColor) {
    calculatedBackgroundColor.value = props.backgroundColor;
  }
};

const fallbackBlur = computed(() => `${Math.min(props.blur ?? 6, 6)}px`);

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
      blur: props.blur,
      radius: props.radius,
      radiusTR: props.radiusTR,
      radiusBR: props.radiusBR,
      radiusBL: props.radiusBL,
      radiusTL: props.radiusTL,
      useCustomColor: props.useCustomColor,
    });

    materialManager.value.on('backgroundColorModeChanged', () => {
      updateBackgroundColor();
    });
  }
});

watch(isFallbackMode, () => {
  // Force update of background color when fallback mode changes
  allowingColorTransition.value = undefined;
});

const updateTimer = ref<number | null>(null);

const interactionState = ref({
  pointerId: undefined as number | undefined,
  isPointerDown: false,
  interacting: false,
  currentX: 0,
  currentY: 0,
  targetX: 0,
  targetY: 0,
  currentScaleX: 1,
  currentScaleY: 1,
  targetScaleX: 1,
  targetScaleY: 1,
  highlightX: 0.5,
  highlightY: 0.5,
  highlightVisible: false,
});

const materialStyle = computed(() => {
  const {
    currentX, currentY, currentScaleX, currentScaleY,
  } = interactionState.value;
  return {
    transform: `translate3d(${currentX}px, ${currentY}px, 0) scale(${currentScaleX}, ${currentScaleY})`,
  };
});

const highlightVisible = computed(() => interactionState.value.highlightVisible && !isFallbackMode.value);

const highlightStyle = computed(() => {
  const cfg = interaction.value;
  const size = `${cfg.highlightSize}px`;
  const opacity = cfg.highlightOpacity;
  const hdr = cfg.highlightHDRFactor;
  const x = interactionState.value.highlightX * 100;
  const y = interactionState.value.highlightY * 100;
  return {
    width: size,
    height: size,
    opacity: highlightVisible.value ? opacity : 0,
    transform: `translate(-50%, -50%) translate(${x}%, ${y}%)`,
    background: `radial-gradient(circle at 50% 50%, rgba(255,255,255, ${opacity * hdr}) 0%, rgba(255,255,255, 0) 65%)`,
    filter: `brightness(${hdr}) saturate(1.1)`,
  } as Record<string, string | number>;
});

const emitTransformToManager = (payload: LiquidRendererMaterialElementTransform) => {
  if (!materialManager.value) return;
  materialManager.value.setTransform(payload);
};

const setInteractionTargets = (deltaX: number, deltaY: number, active: boolean) => {
  const cfg = interaction.value;
  const targetScaleBase = active ? cfg.activeScale : cfg.baseScale;
  const stretchX = Math.max(-cfg.stretchLimit, Math.min(cfg.stretchLimit, deltaX * cfg.stretchFactor));
  const stretchY = Math.max(-cfg.stretchLimit, Math.min(cfg.stretchLimit, deltaY * cfg.stretchFactor));

  interactionState.value.targetX = deltaX * cfg.translateFactor;
  interactionState.value.targetY = deltaY * cfg.translateFactor;
  interactionState.value.targetScaleX = targetScaleBase + stretchX;
  interactionState.value.targetScaleY = targetScaleBase + stretchY;
};

const resetInteractionTargets = () => {
  const cfg = interaction.value;
  interactionState.value.targetX = 0;
  interactionState.value.targetY = 0;
  interactionState.value.targetScaleX = cfg.baseScale;
  interactionState.value.targetScaleY = cfg.baseScale;
  interactionState.value.interacting = false;
};

const updateHighlightPosition = (nx: number, ny: number) => {
  const lag = interaction.value.followLag;
  interactionState.value.highlightX += (nx - interactionState.value.highlightX) * lag;
  interactionState.value.highlightY += (ny - interactionState.value.highlightY) * lag;
};

const animationFrameId = ref<number | null>(null);

const stepAnimation = () => {
  const state = interactionState.value;
  const cfg = interaction.value;
  const damping = state.interacting ? cfg.damping : cfg.releaseDamping;

  state.currentX += (state.targetX - state.currentX) * damping;
  state.currentY += (state.targetY - state.currentY) * damping;
  state.currentScaleX += (state.targetScaleX - state.currentScaleX) * damping;
  state.currentScaleY += (state.targetScaleY - state.currentScaleY) * damping;

  if (!state.interacting) {
    const smallMove = Math.abs(state.targetX) < cfg.reboundThreshold && Math.abs(state.targetY) < cfg.reboundThreshold;
    if (smallMove) {
      state.targetX -= state.currentX * cfg.reboundDamping;
      state.targetY -= state.currentY * cfg.reboundDamping;
    }
  }

  emitTransformToManager({
    scaleX: state.currentScaleX,
    scaleY: state.currentScaleY,
    translateX: state.currentX,
    translateY: state.currentY,
  });

  const nearTarget = Math.abs(state.targetX - state.currentX) < 0.01
    && Math.abs(state.targetY - state.currentY) < 0.01
    && Math.abs(state.targetScaleX - state.currentScaleX) < 0.001
    && Math.abs(state.targetScaleY - state.currentScaleY) < 0.001;

  if (!state.interacting && nearTarget) {
    animationFrameId.value = null;
    return;
  }

  animationFrameId.value = window.requestAnimationFrame(stepAnimation);
};

const ensureAnimation = () => {
  if (animationFrameId.value === null) {
    animationFrameId.value = window.requestAnimationFrame(stepAnimation);
  }
};

const stopAnimation = () => {
  if (animationFrameId.value !== null) {
    window.cancelAnimationFrame(animationFrameId.value);
    animationFrameId.value = null;
  }
};

const readPointer = (event: PointerEvent) => {
  if (!materialElement.value) {
    return {
      nx: 0.5, ny: 0.5, dx: 0, dy: 0,
    };
  }
  const rect = materialElement.value.getBoundingClientRect();
  const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  return {
    nx, ny, dx, dy,
  };
};

const onPointerDown = (event: PointerEvent) => {
  if (props.disableInteractions) return;
  interactionState.value.pointerId = event.pointerId;
  interactionState.value.isPointerDown = true;
  interactionState.value.interacting = true;
  interactionState.value.highlightVisible = true;

  materialElement.value?.setPointerCapture(event.pointerId);

  const {
    nx, ny, dx, dy,
  } = readPointer(event);
  updateHighlightPosition(nx, ny);
  setInteractionTargets(dx, dy, true);
  ensureAnimation();
};

const onPointerMove = (event: PointerEvent) => {
  if (props.disableInteractions) return;
  if (event.pointerType === 'mouse' && props.onlyClickInteractions && !interactionState.value.isPointerDown) return;

  const shouldActivate = interactionState.value.isPointerDown || (event.pointerType === 'mouse' && !props.onlyClickInteractions);
  interactionState.value.interacting = shouldActivate;
  interactionState.value.highlightVisible = shouldActivate || event.pointerType !== 'mouse';

  const {
    nx, ny, dx, dy,
  } = readPointer(event);
  updateHighlightPosition(nx, ny);
  setInteractionTargets(dx, dy, shouldActivate);
  ensureAnimation();
};

const onPointerUp = () => {
  if (props.disableInteractions) return;
  interactionState.value.isPointerDown = false;
  interactionState.value.highlightVisible = false;
  resetInteractionTargets();
  ensureAnimation();
};

const onPointerLeave = () => {
  if (props.disableInteractions) return;
  interactionState.value.isPointerDown = false;
  interactionState.value.highlightVisible = false;
  resetInteractionTargets();
  ensureAnimation();
};

onUnmounted(() => {
  manager.off('fallbackModeChanged', onFallbackModeChanged);
  if (materialManager.value) {
    materialManager.value.destroy();
  }
  if (updateTimer.value !== null) {
    clearInterval(updateTimer.value);
    updateTimer.value = null;
  }
  stopAnimation();
});

// Function to trigger re-rendering of this material
const updating = (duration: number) => {
  if (materialManager.value) {
    // Clear existing timer to prevent accumulation
    if (updateTimer.value !== null) {
      clearInterval(updateTimer.value);
      updateTimer.value = null;
    }

    const interval = 10;
    const times = Math.floor(duration / interval) + 1;
    let count = 0;

    // Immediate update
    materialManager.value.updatePositionAndSize();

    updateTimer.value = window.setInterval(() => {
      materialManager.value?.updatePositionAndSize();

      if (count++ >= times) {
        if (updateTimer.value !== null) {
          clearInterval(updateTimer.value);
          updateTimer.value = null;
        }
      }
    }, interval);
  }
};

const startUpdating = () => {
  if (updateTimer.value === null) {
    updating(Infinity);
  }
};

const stopUpdating = () => {
  if (updateTimer.value !== null) {
    clearInterval(updateTimer.value);
    updateTimer.value = null;
  }
};

// Watch color change
watch(() => calculatedBackgroundColor.value, () => {
  // Allow transition only after the first change
  if (allowingColorTransition.value === undefined) {
    allowingColorTransition.value = false;
  } else if (allowingColorTransition.value === false) {
    allowingColorTransition.value = true;
  }
});

watch(() => props.disableInteractions, (disabled) => {
  if (disabled) {
    resetInteractionTargets();
    interactionState.value.highlightVisible = false;
    stopAnimation();
  }
});

defineExpose({ updating, startUpdating, stopUpdating });

</script>

<style scoped>
.liquid-glass-material {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: v-bind(borderRadius);
  border: 2px solid #ffffff61;
  overflow: hidden;
  background-color: v-bind(calculatedBackgroundColor);
  color: v-bind(calculatedForegroundColor);
  box-shadow: inset 0 0 v-bind(boxShadowInsetSize) v-bind(calculatedBoxShadowInsetBackgroundColor),
    0 0 v-bind(boxShadowSize) v-bind(calculatedBoxShadowBackgroundColor);

  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border 0.2s ease, backdrop-filter 0.2s ease, -webkit-backdrop-filter 0.2s ease;

  &[allowing-color-transition="true"] {
    transition: background-color 0.5s ease, color 0.5s ease, box-shadow 0.5s ease, border 0.5s ease, backdrop-filter 0.5s ease, -webkit-backdrop-filter 0.5s ease;
  }

  &[render-mode="uniform"] {
    z-index: 10000;
  }

  &[is-fallback-mode="true"] {
    backdrop-filter: blur(v-bind(fallbackBlur)) saturate(80%);
    -webkit-backdrop-filter: blur(v-bind(fallbackBlur)) saturate(80%);
  }
}

.liquid-glass-highlight {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  border-radius: 50%;
  mix-blend-mode: screen;
  will-change: transform, opacity;
  transition: opacity 60ms ease;
}
</style>
