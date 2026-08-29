<script setup lang="ts">
import type {
  AutomaticBackgroundColorMode,
  MaterialChanges,
  MaterialConfig,
  MaterialHandle,
} from '@agou/liquid-glass-core';
import {
  bindMaterialPointerEvents,
  MaterialDomPresentationController,
  MaterialPointerController,
} from '@agou/liquid-glass-core';
import { computed, ref, shallowRef, watch } from 'vue';

import { useLiquidGlassContext } from '../composables/liquidGlassContext';
import { mergeVueInteractionConfig } from '../legacy-interaction';
import type {
  LiquidGlassMaterialExposed,
  LiquidGlassMaterialProps,
} from '../types';

function runMaterialCleanupTasks(tasks: readonly (() => void)[]): void {
  let failed = false;
  let firstFailure: unknown;
  for (const task of tasks) {
    try {
      task();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstFailure = error;
      }
    }
  }
  if (failed) throw firstFailure;
}

function rollbackMaterialSetup(
  failure: unknown,
  tasks: readonly (() => void)[],
): never {
  try {
    runMaterialCleanupTasks(tasks);
  } catch {
    // The setup failure remains authoritative after every acquired resource is released.
  }
  throw failure;
}

defineOptions({
  name: 'LiquidGlassMaterial',
  inheritAttrs: false,
});

const props = withDefaults(defineProps<LiquidGlassMaterialProps>(), {
  radius: 24,
  thickness: 10,
  refractIndex: 1.1,
  refractIntensity: 0.5,
  dispersion: 0.01,
  illuminationAngle: 45,
  illuminationIntensity: 0.5,
});
const emit = defineEmits<{
  /** Emitted when backdrop sampling changes the effective material theme. */
  backgroundColorChange: [themeColorMode: AutomaticBackgroundColorMode];
}>();

const { context } = useLiquidGlassContext();
const materialElement = ref<HTMLElement | null>(null);
const highlightElement = ref<HTMLElement | null>(null);
const handle = shallowRef<MaterialHandle | null>(null);
const updating = ref(false);
let pointerController: MaterialPointerController | null = null;
let presentationController: MaterialDomPresentationController | null = null;

const resolvedInteractionConfig = computed(() => mergeVueInteractionConfig(
  props.interaction,
  props.interactionConfig,
));

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
  isMoveable: props.isMoveable,
  interactionPreset: props.interactionPreset,
  interactionConfig: resolvedInteractionConfig.value,
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
    '--lg-fallback-blur': `${Math.min(props.blur ?? 6, 6)}px`,
  };
});

function materialAppearance() {
  return {
    backgroundColor: props.backgroundColor,
    illuminationAngle: props.illuminationAngle,
    illuminationIntensity: props.illuminationIntensity,
    thickness: props.thickness,
    useCustomColor: props.useCustomColor,
  };
}

function interactionPolicy() {
  return {
    disableInteractions: props.disableInteractions,
    onlyClickInteractions: props.onlyClickInteractions,
  };
}

watch(
  [context, materialElement, highlightElement],
  ([currentContext, element, highlight], _previous, onCleanup) => {
    if (!currentContext || !element || !highlight) {
      return;
    }

    const config: MaterialConfig = {
      element,
      ...materialChanges.value,
    };
    const registration = currentContext.addMaterial(config);
    const cleanupTasks: Array<() => void> = [() => registration.destroy()];
    try {
      const pointer = new MaterialPointerController(
        element,
        registration,
        interactionPolicy(),
      );
      cleanupTasks.unshift(() => pointer.destroy());
      const unbindPointerEvents = bindMaterialPointerEvents(element, pointer);
      cleanupTasks.unshift(unbindPointerEvents);
      const presentation = new MaterialDomPresentationController(
        element,
        highlight,
        registration,
        materialAppearance(),
      );
      cleanupTasks.unshift(() => presentation.destroy());
      if (updating.value) registration.startLayoutUpdates();
      let themeColorMode: AutomaticBackgroundColorMode | null = null;
      const stopThemeFeedback = registration.onPresentation((snapshot) => {
        if (themeColorMode === null) {
          themeColorMode = snapshot.themeColorMode;
          return;
        }
        if (themeColorMode === snapshot.themeColorMode) return;
        themeColorMode = snapshot.themeColorMode;
        emit('backgroundColorChange', themeColorMode);
      });
      cleanupTasks.unshift(stopThemeFeedback);
      handle.value = registration;
      pointerController = pointer;
      presentationController = presentation;

      onCleanup(() => {
        try {
          runMaterialCleanupTasks(cleanupTasks);
        } finally {
          if (handle.value === registration) {
            handle.value = null;
          }
          if (pointerController === pointer) pointerController = null;
          if (presentationController === presentation) presentationController = null;
        }
      });
    } catch (error) {
      rollbackMaterialSetup(error, cleanupTasks);
    }
  },
  { immediate: true, flush: 'post' },
);

watch(materialChanges, (changes) => {
  handle.value?.update(changes);
}, { deep: true });

watch(
  () => [props.disableInteractions, props.onlyClickInteractions],
  () => pointerController?.updatePolicy(interactionPolicy()),
);

watch(
  () => [
    props.backgroundColor,
    props.illuminationAngle,
    props.illuminationIntensity,
    props.thickness,
    props.useCustomColor,
  ],
  () => presentationController?.updateAppearance(materialAppearance()),
);

function startUpdating(): void {
  if (updating.value) return;
  const currentHandle = handle.value;
  if (!currentHandle) return;
  currentHandle.startLayoutUpdates();
  updating.value = true;
}

function stopUpdating(): void {
  if (!updating.value) return;
  const currentHandle = handle.value;
  if (!currentHandle) return;
  currentHandle.stopLayoutUpdates();
  updating.value = false;
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
    :disable-interactions="String(props.disableInteractions === true)"
    :only-click-interactions="String(props.onlyClickInteractions === true)"
    :render-mode="props.renderMode"
    :style="materialStyle"
    v-bind="$attrs"
  >
    <div class="liquid-glass-background" aria-hidden="true" />
    <div ref="highlightElement" class="liquid-glass-highlight" aria-hidden="true" />
    <slot
      :updating="updating"
      :start-updating="startUpdating"
      :stop-updating="stopUpdating"
    />
  </div>
</template>
