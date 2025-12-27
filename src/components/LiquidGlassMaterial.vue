<template>
  <div class="liquid-glass-material" ref="materialElement" :render-mode="renderMode" :is-fallback-mode="isFallbackMode"
    :allowing-color-transition="allowingColorTransition" :disable-interactions="disableInteractions"
    :only-click-interactions="onlyClickInteractions" :style="materialStyle" @pointerdown="onPointerDown"
    @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" @pointerleave="onPointerLeave">
    <div class="liquid-glass-highlight" :class="{ visible: highlightVisible }" :style="highlightStyle"></div>
    <slot :updating="updating" :startUpdating="startUpdating" :stopUpdating="stopUpdating"></slot>
  </div>
</template>

<script lang="ts" setup>
import {
  computed, onMounted, onUnmounted, ref, shallowRef,
  watch,
} from 'vue';

import { useMaterialDelegation } from '../composables/useMaterialDelegation';
import { useLiquidContext, useLiquidDepth } from '../core/LiquidContext';
import { LiquidRendererMaterialElement } from '../core/LiquidRendererMaterialElement';
import type { ProxyTargetInterface } from '../types/ExternalMaterial';
import { LiquidRendererMaterialElementTransform } from '../types/LiquidGlass';

type InteractionConfig = {
  baseScale: number;
  activeScale: number;
  translateFactor: number;
  stretchFactor: number;
  stretchLimit: number;
  damping: number;
  reboundDamping: number;
  releaseDamping: number;
  releaseReboundDamping: number;
  reboundThreshold: number;
  highlightSize: number;
  highlightOpacity: number;
  highlightHDRFactor: number;
  followLag: number;
};

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
  dispersion?: number; // Chromatic aberration strength (0.0 to 0.05)
  saturation?: number;
  useCustomColor?: boolean;
  backgroundColor?: string;
  disableInteractions?: boolean;
  onlyClickInteractions?: boolean;
  interaction?: Partial<InteractionConfig>;
  /** Whether the material is moveable by user interaction */
  isMoveable?: boolean;
  illuminationAngle?: number;
  illuminationIntensity?: number;
  /**
   * Proxy target for cross-component render delegation.
   * When set, this material's glass effect will be rendered by the target LiquidGlass
   * instead of its parent. Useful when this material is visually positioned over
   * a nested LiquidGlass component.
   */
  proxyTarget?: ProxyTargetInterface | null;
}>();

const defaultInteraction: InteractionConfig = {
  baseScale: 1,
  activeScale: 1.01,
  translateFactor: 0.08,
  stretchFactor: 0.0003,
  stretchLimit: 1,
  damping: 0.15,
  reboundDamping: 0.13,
  releaseDamping: 0.18,
  releaseReboundDamping: 0.19,
  reboundThreshold: 0.12,
  highlightSize: 200,
  highlightOpacity: 0.5,
  highlightHDRFactor: 1.2,
  followLag: 1,
};

const interaction = computed<InteractionConfig>(() => ({
  ...defaultInteraction,
  ...(props.interaction ?? {}),
  ...props.isMoveable ? { translateFactor: 0 } : {},
}));

const materialElement = ref<HTMLElement | null>(null);
const materialManager = shallowRef<LiquidRendererMaterialElement | null>(null);

const INTERACTIVE_TAGS = new Set([
  'A',
  'BUTTON',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'OPTION',
  'LABEL',
  'SUMMARY',
  'DETAILS',
  'VIDEO',
  'AUDIO',
]);

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'menuitem',
  'option',
  'radio',
  'switch',
  'tab',
]);

// Detect whether the pointer originates from an interactive child.
// We still run material interaction, but we avoid capturing the pointer to keep child interactivity intact.
const isFromInteractiveChild = (event: PointerEvent) => {
  const path = event.composedPath();
  // eslint-disable-next-line no-restricted-syntax
  for (const node of path) {
    // eslint-disable-next-line no-continue
    if (!(node instanceof HTMLElement)) continue;

    if (node === materialElement.value) break;

    if (node.dataset.lgSkipInteraction === 'true' || node.dataset.lgIgnoreMaterial === 'true') return true;
    const tag = node.tagName;
    if (INTERACTIVE_TAGS.has(tag)) return true;
    const role = node.getAttribute('role');
    if (role && INTERACTIVE_ROLES.has(role)) return true;
    if (node.isContentEditable) return true;
  }
  return false;
};

const interactivePointerIds = new Set<number>();

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
const depth = useLiquidDepth(0);

// Calculate depth-aware z-index for the material
// Material z-index should be: 10000 - depth * 2
// This ensures parent materials (depth 0) have z-index 10000,
// and child materials (depth 1) have z-index 9998, etc.
// This is 1 higher than the parent's canvas z-index (9999 - depth * 2)
// but lower than the grandparent's canvas
const materialZIndex = computed(() => 10000 - depth * 2);

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
  if (props.backgroundColor) return;
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

const renderMode = ref(manager.renderMode);
manager.on('optionsChanged', () => {
  renderMode.value = manager.renderMode;
});

// Setup delegation composable for cross-component render delegation
const getGlassAttributes = () => {
  const attrs = materialManager.value?.glassAttributes;
  return {
    thickness: attrs?.thickness ?? props.thickness ?? 10,
    refractIndex: attrs?.refractIndex ?? props.refractIndex ?? 1.1,
    refractIntensity: attrs?.refractIntensity ?? props.refractIntensity ?? 0.5,
    blur: attrs?.blur ?? props.blur ?? 0,
    dispersion: attrs?.dispersion ?? props.dispersion ?? 0.01,
    radius: attrs?.radius ?? props.radius,
    radiusTR: attrs?.radiusTR ?? props.radiusTR ?? props.radius,
    radiusBR: attrs?.radiusBR ?? props.radiusBR ?? props.radius,
    radiusBL: attrs?.radiusBL ?? props.radiusBL ?? props.radius,
    radiusTL: attrs?.radiusTL ?? props.radiusTL ?? props.radius,
  };
};

const getTransform = () => materialManager.value?.transform ?? {
  scaleX: 1,
  scaleY: 1,
  translateX: 0,
  translateY: 0,
};

const {
  isDelegating,
  setProxyTarget,
  proxyFeedback,
  updateDelegation,
} = useMaterialDelegation({
  materialElement: materialManager,
  element: materialElement,
  parentManager: manager,
  getGlassAttributes,
  getTransform,
});

// Watch for proxyTarget prop changes
watch(() => props.proxyTarget, (newTarget) => {
  setProxyTarget(newTarget ?? null);
}, { immediate: true });

// Apply feedback from proxy target for theme colors
watch(proxyFeedback, (feedback) => {
  if (feedback && isDelegating.value) {
    // Override automatic background color with feedback from proxy
    switch (feedback.themeColorMode) {
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
  }
});

onMounted(() => {
  // Register self as a material element
  if (materialElement.value) {
    materialManager.value = new LiquidRendererMaterialElement(manager, materialElement.value, {
      thickness: props.thickness,
      refractIndex: props.refractIndex,
      refractIntensity: props.refractIntensity,
      blur: props.blur,
      dispersion: props.dispersion,
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

    // Initialize proxy target if provided
    if (props.proxyTarget) {
      setProxyTarget(props.proxyTarget);
    }
  }
});

watch(isFallbackMode, () => {
  // Force update of background color when fallback mode changes
  allowingColorTransition.value = undefined;
});

const updateTimer = ref<number | null>(null);

const triggerRebound = ref<boolean | undefined>(undefined);

const interactionState = ref({
  pointerId: undefined as number | undefined,
  isPointerDown: false,
  interacting: false,
  originX: null as number | null,
  originY: null as number | null,
  currentX: 0,
  currentY: 0,
  prevX: 0,
  prevY: 0,
  targetX: 0,
  targetY: 0,
  reboundTargetX: 0,
  reboundTargetY: 0,
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

  // Base style with transform
  const style: Record<string, string | number> = {
    transform: `translate3d(${currentX}px, ${currentY}px, 0) scale(${currentScaleX}, ${currentScaleY})`,
  };

  // Apply depth-aware z-index only in uniform render mode
  if (renderMode.value === 'uniform') {
    style.zIndex = materialZIndex.value;
  }

  return style;
});

const highlightVisible = computed(() => interactionState.value.highlightVisible && !isFallbackMode.value);

const highlightStyle = computed(() => {
  const cfg = interaction.value;
  const size = `${cfg.highlightSize}px`;
  const opacity = highlightVisible.value ? cfg.highlightOpacity : 0;
  const hdr = cfg.highlightHDRFactor;
  const x = interactionState.value.highlightX * 100;
  const y = interactionState.value.highlightY * 100;
  return {
    width: size,
    height: size,
    opacity,
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(-50%, -50%) scale(${highlightVisible.value ? 1 : 5})`,
    background: `radial-gradient(circle at 50% 50%,
      rgba(255, 255, 255, ${opacity * hdr}) 0%,
      rgba(255, 255, 255, ${opacity * hdr * 0.95}) 15%,
      rgba(255, 255, 255, ${opacity * hdr * 0.03}) 65%,
      rgba(255, 255, 255, 0) 100%)`,
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
  let targetScaleX = targetScaleBase + stretchX;
  let targetScaleY = targetScaleBase + stretchY;

  if (targetScaleX * targetScaleY > cfg.activeScale * cfg.activeScale) {
    const scaleFactor = Math.sqrt((targetScaleX * targetScaleY));
    targetScaleX /= scaleFactor;
    targetScaleY /= scaleFactor;
  }

  interactionState.value.targetScaleX = targetScaleX;
  interactionState.value.targetScaleY = targetScaleY;
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
const lastTimestamp = ref<number | null>(null);

const toDeltaFrames = (deltaMs: number) => {
  const frames = deltaMs / (1000 / 60);
  return Math.min(Math.max(frames, 0.1), 5);
};

const lerpWithDamping = (current: number, target: number, perFrameDamping: number, deltaFrames: number) => {
  const factor = 1 - (1 - perFrameDamping) ** deltaFrames;
  return current + (target - current) * factor;
};

const scaleWithDelta = (value: number, deltaFrames: number) => 1 - (1 - value) ** deltaFrames;

const stepAnimation = (timestamp: number) => {
  if (lastTimestamp.value === null) {
    lastTimestamp.value = timestamp;
  }

  const deltaMs = timestamp - lastTimestamp.value;
  const deltaFrames = toDeltaFrames(deltaMs);
  lastTimestamp.value = timestamp;

  const state = interactionState.value;
  const cfg = interaction.value;
  const perFrameDamping = state.interacting ? cfg.damping : cfg.releaseDamping;

  const prevX = state.currentX;
  const prevY = state.currentY;
  const prevScaleX = state.currentScaleX;
  const prevScaleY = state.currentScaleY;

  state.currentX = lerpWithDamping(state.currentX, state.targetX, perFrameDamping, deltaFrames);
  state.currentY = lerpWithDamping(state.currentY, state.targetY, perFrameDamping, deltaFrames);
  state.currentScaleX = lerpWithDamping(state.currentScaleX, state.targetScaleX, perFrameDamping, deltaFrames);
  state.currentScaleY = lerpWithDamping(state.currentScaleY, state.targetScaleY, perFrameDamping, deltaFrames);

  let velocityX = state.currentX - prevX;
  let velocityY = state.currentY - prevY;
  let velocityScaleX = state.currentScaleX - prevScaleX;
  let velocityScaleY = state.currentScaleY - prevScaleY;

  // Returning
  if (!state.interacting) {
    if (triggerRebound.value === undefined) {
      triggerRebound.value = Math.abs(state.targetX) < cfg.reboundThreshold && Math.abs(state.targetY) < cfg.reboundThreshold;
    }

    if (triggerRebound.value) {
      const reboundFactor = scaleWithDelta(cfg.releaseReboundDamping, deltaFrames);
      state.targetX -= state.currentX * reboundFactor;
      state.targetY -= state.currentY * reboundFactor;
      state.targetScaleX += (cfg.baseScale - state.currentScaleX) * reboundFactor;
      state.targetScaleY += (cfg.baseScale - state.currentScaleY) * reboundFactor;
    }
  } else {
    // if (i++ % 100 === 0) {
    // console.log('Rebound', {
    //   currentX: state.currentX,
    //   currentY: state.currentY,
    //   originX: state.originX,
    //   originY: state.originY,
    //   targetX: state.targetX,
    //   targetY: state.targetY,
    //   reboundTargetX: state.reboundTargetX,
    //   reboundTargetY: state.reboundTargetY,
    //   triggerRebound: triggerRebound.value,
    // });
    // }
    // eslint-disable-next-line no-lonely-if
    if (triggerRebound.value === undefined
      && Math.abs(state.currentX - state.targetX) < 1
      && Math.abs(state.currentY - state.targetY) < 1
      && state.currentX !== 0
      && state.currentY !== 0
      && state.targetX !== 0
      && state.targetY !== 0
      && Math.abs(state.currentX - state.reboundTargetX) > 0.5
      && Math.abs(state.currentY - state.reboundTargetY) > 0.5
    ) {
      triggerRebound.value = true;

      // console.log('Rebound', {
      //   currentX: state.currentX,
      //   currentY: state.currentY,
      //   originX: state.originX,
      //   originY: state.originY,
      //   targetX: state.targetX,
      //   targetY: state.targetY,
      //   reboundTargetX: state.reboundTargetX,
      //   reboundTargetY: state.reboundTargetY,
      //   triggerRebound: triggerRebound.value,
      // });

      // console.log('Setting triggerRebound to true');

      // if (triggerRebound.value) {
      state.reboundTargetX = state.targetX / 1.5;
      state.reboundTargetY = state.targetY / 1.5;

      state.targetX = state.reboundTargetX;
      state.targetY = state.reboundTargetY;

      // triggerRebound.value = false;

      // console.log('New target after rebound:', {
      //   // currentX: state.currentX,
      //   // currentY: state.currentY,
      //   // originX: state.originX,
      //   // originY: state.originY,
      //   // targetX: state.targetX,
      //   // targetY: state.targetY,
      //   reboundTargetX: state.reboundTargetX,
      //   reboundTargetY: state.reboundTargetY,
      //   // triggerRebound: triggerRebound.value,
      // });
      // // }
    }
  }

  velocityX = state.currentX - prevX;
  velocityY = state.currentY - prevY;
  velocityScaleX = state.currentScaleX - prevScaleX;
  velocityScaleY = state.currentScaleY - prevScaleY;

  emitTransformToManager({
    scaleX: state.currentScaleX,
    scaleY: state.currentScaleY,
    translateX: state.currentX,
    translateY: state.currentY,
  });

  const atRest = !state.interacting
    ? Math.abs(state.targetX) < 0.01
    && Math.abs(state.targetY) < 0.01
    && Math.abs(state.currentX) < 0.01
    && Math.abs(state.currentY) < 0.01
    && Math.abs(state.currentScaleX - cfg.baseScale) < 0.001
    && Math.abs(state.currentScaleY - cfg.baseScale) < 0.001
    && Math.abs(velocityX) < 0.001
    && Math.abs(velocityY) < 0.001
    && Math.abs(velocityScaleX) < 0.0005
    && Math.abs(velocityScaleY) < 0.0005
    : (
      (Math.abs(state.targetX) < 0.01
        && Math.abs(state.targetY) < 0.01
        && Math.abs(state.currentX) < 0.01
        && Math.abs(state.currentY) < 0.01)
      || (
        triggerRebound.value !== undefined
        && Math.abs(state.currentX - state.reboundTargetX) < 0.5
        && Math.abs(state.currentY - state.reboundTargetY) < 0.5));

  if (atRest) {
    // console.log('Animation at rest #rebound:', triggerRebound.value, 'interacting:', state.interacting);
    if (!state.interacting) {
      if (triggerRebound.value) {
        triggerRebound.value = false;
      } else {
        animationFrameId.value = null;
        // eslint-disable-next-line no-use-before-define
        stopAnimation();

        return;
      }
    } else if (triggerRebound.value) {
      triggerRebound.value = undefined;
      // console.log('Resetting triggerRebound to false');
    } else {
      triggerRebound.value = undefined;
      // console.log('Resetting triggerRebound to undefined');
    }
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

    // Reset interaction state
    interactionState.value.reboundTargetX = 0;
    interactionState.value.reboundTargetY = 0;
  }

  lastTimestamp.value = null;
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
  const originX = interactionState.value.originX ?? event.clientX;
  const originY = interactionState.value.originY ?? event.clientY;
  const dx = event.clientX - originX;
  const dy = event.clientY - originY;
  return {
    nx, ny, dx, dy,
  };
};

const onPointerDown = (event: PointerEvent) => {
  if (props.disableInteractions) return;
  const fromInteractiveChild = isFromInteractiveChild(event);
  if (fromInteractiveChild) {
    interactivePointerIds.add(event.pointerId);
  } else {
    interactivePointerIds.delete(event.pointerId);
  }
  interactionState.value.pointerId = event.pointerId;
  interactionState.value.isPointerDown = true;
  interactionState.value.interacting = true;
  interactionState.value.highlightVisible = true;
  interactionState.value.originX = event.clientX;
  interactionState.value.originY = event.clientY;

  if (!fromInteractiveChild) {
    materialElement.value?.setPointerCapture(event.pointerId);
  }

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
  const fromInteractiveChild = interactivePointerIds.has(event.pointerId) || isFromInteractiveChild(event);
  if (fromInteractiveChild && interactionState.value.pointerId === undefined) {
    interactivePointerIds.add(event.pointerId);
  }

  if (interactionState.value.originX === null || interactionState.value.originY === null) {
    interactionState.value.originX = event.clientX;
    interactionState.value.originY = event.clientY;
  }

  const shouldActivate = interactionState.value.isPointerDown
    || (event.pointerType === 'mouse' && !props.onlyClickInteractions)
    || fromInteractiveChild;
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
  if (interactionState.value.pointerId !== undefined) {
    interactivePointerIds.delete(interactionState.value.pointerId);
  }
  interactionState.value.isPointerDown = false;
  interactionState.value.highlightVisible = false;
  resetInteractionTargets();
  ensureAnimation();
};

const onPointerLeave = () => {
  if (props.disableInteractions) return;
  if (interactionState.value.pointerId !== undefined) {
    interactivePointerIds.delete(interactionState.value.pointerId);
  }
  interactionState.value.isPointerDown = false;
  interactionState.value.highlightVisible = false;
  interactionState.value.originX = null;
  interactionState.value.originY = null;
  resetInteractionTargets();
  ensureAnimation();
};

const borderImage = computed(() => {
  const angle = props.illuminationAngle ?? 45;
  // Light-effect: same hue (white) with varying alpha for a glossy sweep
  const intensity = props.illuminationIntensity ?? 0.5; // peak alpha
  const low = Math.max(0, Math.min(intensity * 0.2, 1));
  const mid = Math.max(0, Math.min(intensity * 0.45, 1));
  const high = Math.max(0, Math.min(intensity, 1));

  const start = angle;
  const fixAngle = (a: number) => ((a % 360) + 360) % 360;
  const color = (alpha: number) => `rgba(255, 255, 255, ${alpha})`;

  // Balanced stops: high-light → mid → low → mid → high (seamless)
  let gradientList = [
    { angle: fixAngle(start + 0), color: high },
    { angle: fixAngle(start + 60), color: mid },
    { angle: fixAngle(start + 90), color: low },
    { angle: fixAngle(start + 120), color: mid },
    { angle: fixAngle(start + 180), color: high },
    { angle: fixAngle(start + 240), color: mid },
    { angle: fixAngle(start + 270), color: low },
    { angle: fixAngle(start + 300), color: mid },
    { angle: fixAngle(start + 360), color: high },
  ];

  // Sort by angle
  gradientList = gradientList.sort((a, b) => a.angle - b.angle);

  // Ensure the ring wraps smoothly: explicit 0° and 360° stops with interpolated alpha
  const firstStop = gradientList[0];
  const lastStop = gradientList[gradientList.length - 1];

  if (firstStop.angle !== 0) {
    const span = 360 - lastStop.angle + firstStop.angle; // distance crossing 360→0
    const ratio = span === 0 ? 0 : (360 - lastStop.angle) / span;
    const interpolatedAlpha = lastStop.color + (firstStop.color - lastStop.color) * ratio;
    gradientList.unshift({ angle: 0, color: interpolatedAlpha });
  }

  const newLast = gradientList[gradientList.length - 1];
  if (newLast.angle !== 360) {
    const endAlpha = gradientList[0].color; // match 0° to avoid seam
    gradientList.push({ angle: 360, color: endAlpha });
  }

  const gradientStops = gradientList
    .map((stop) => `${color(stop.color)} ${stop.angle}deg`)
    .join(', ');

  return `conic-gradient(${gradientStops})`;
});

watch(() => interactionState.value.interacting, () => {
  triggerRebound.value = undefined;
});

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

watch(() => [
  props.thickness,
  props.refractIndex,
  props.refractIntensity,
  props.radius,
  props.radiusTR,
  props.radiusBR,
  props.radiusBL,
  props.radiusTL,
  props.blur,
  props.dispersion,
  props.saturation,
  props.useCustomColor,
  props.backgroundColor,
  props.illuminationAngle,
  props.illuminationIntensity,
], () => {
  if (materialManager.value) {
    materialManager.value.setOptions({
      thickness: props.thickness,
      refractIndex: props.refractIndex,
      refractIntensity: props.refractIntensity,
      radius: props.radius,
      radiusTR: props.radiusTR,
      radiusBR: props.radiusBR,
      radiusBL: props.radiusBL,
      radiusTL: props.radiusTL,
      blur: props.blur,
      dispersion: props.dispersion,
      saturation: props.saturation,
      useCustomColor: props.useCustomColor,
      backgroundColor: props.backgroundColor,
      illuminationAngle: props.illuminationAngle,
      illuminationIntensity: props.illuminationIntensity,
    });

    // Update delegation when glass attributes change
    updateDelegation();
  }
});

defineExpose({
  updating,
  startUpdating,
  stopUpdating,
  /** Whether this material is delegating its rendering to a proxy target */
  isDelegating,
  /** Force update the delegation state */
  updateDelegation,
  /** Set or clear the proxy target */
  setProxyTarget,
});

</script>

<style scoped>
.liquid-glass-material {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: v-bind(borderRadius);
  overflow: hidden;
  background-color: v-bind(calculatedBackgroundColor);
  color: v-bind(calculatedForegroundColor);
  box-shadow: inset 0 0 v-bind(boxShadowInsetSize) v-bind(calculatedBoxShadowInsetBackgroundColor),
    0 0 v-bind(boxShadowSize) v-bind(calculatedBoxShadowBackgroundColor);
  will-change: transform;

  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border 0.2s ease, backdrop-filter 0.2s ease, -webkit-backdrop-filter 0.2s ease;
}

.liquid-glass-material::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: 1px;
  border-radius: inherit;
  background: v-bind(borderImage);
  background-size: 100% 100%;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  z-index: 0;
}

.liquid-glass-material>* {
  position: relative;
  z-index: 1;
}

.liquid-glass-material[allowing-color-transition="true"] {
  transition: background-color 0.5s ease, color 0.5s ease, box-shadow 0.5s ease, border 0.5s ease, backdrop-filter 0.5s ease, -webkit-backdrop-filter 0.5s ease;
}

/* Note: z-index for uniform render mode is now set dynamically via materialStyle
   to support depth-aware z-index for nested LiquidGlass components */

.liquid-glass-material[is-fallback-mode="true"] {
  backdrop-filter: blur(v-bind(fallbackBlur)) saturate(80%);
  -webkit-backdrop-filter: blur(v-bind(fallbackBlur)) saturate(80%);
}

.liquid-glass-highlight {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  border-radius: 50%;
  mix-blend-mode: screen;
  will-change: transform, opacity;
  transition: opacity 0.5s, transform 0.5s;

  &.visible {
    transition: opacity 0.4s;
  }
}
</style>
