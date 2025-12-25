import {
  computed, onUnmounted, type Ref, ref, type ShallowRef,
  shallowRef, watch,
} from 'vue';

import type { LiquidRendererManager } from '../core/LiquidRendererManager';
import type { LiquidRendererMaterialElement } from '../core/LiquidRendererMaterialElement';
import type {
  ExternalMaterialConfig,
  ExternalMaterialFeedback,
  ProxyTargetInterface,
} from '../types/ExternalMaterial';
import type { LiquidRendererMaterialElementTransform } from '../types/LiquidGlass';

export interface UseMaterialDelegationOptions {
  /** The material element instance */
  materialElement: ShallowRef<LiquidRendererMaterialElement | null>;

  /** The DOM element of this material */
  element: Ref<HTMLElement | null>;

  /** The parent manager (will be told to skip rendering this material) */
  parentManager: LiquidRendererManager;

  /** Glass attributes getter */
  getGlassAttributes: () => {
    thickness: number;
    refractIndex: number;
    refractIntensity: number;
    blur: number;
    dispersion: number;
    radius: number;
    radiusTR: number;
    radiusBR: number;
    radiusBL: number;
    radiusTL: number;
  };

  /** Transform getter */
  getTransform: () => LiquidRendererMaterialElementTransform;
}

export interface UseMaterialDelegationReturn {
  /** Whether delegation is currently active */
  isDelegating: Ref<boolean>;

  /** Set the proxy target (the child LiquidGlass that will render for this material) */
  setProxyTarget: (target: ProxyTargetInterface | null) => void;

  /** Feedback received from the proxy target */
  proxyFeedback: Ref<ExternalMaterialFeedback | null>;

  /** Force update of delegation state (call on position/config changes) */
  updateDelegation: () => void;
}

/**
 * Composable for materials that delegate their glass rendering to another LiquidGlass instance.
 *
 * When a material is positioned over a nested LiquidGlass, the parent shouldn't render
 * the glass effect for that material. Instead, the child LiquidGlass (which already has
 * the backdrop) acts as a proxy and renders the glass effect.
 */
export function useMaterialDelegation(
  options: UseMaterialDelegationOptions,
): UseMaterialDelegationReturn {
  const {
    materialElement,
    element,
    parentManager,
    getGlassAttributes,
    getTransform,
  } = options;

  // State
  const proxyTarget = shallowRef<ProxyTargetInterface | null>(null);
  const isDelegating = ref(false);
  const proxyFeedback = ref<ExternalMaterialFeedback | null>(null);
  const materialId = ref<string>('');

  // Cleanup function for feedback subscription
  let feedbackUnsubscribe: (() => void) | null = null;

  // RAF loop for position sync
  let rafId: number | null = null;
  let lastClientRect: DOMRect | null = null;

  /**
   * Build the config payload to send to the proxy target
   */
  const buildConfig = (): ExternalMaterialConfig | null => {
    if (!element.value || !materialElement.value) return null;

    const rect = element.value.getBoundingClientRect();
    const attrs = getGlassAttributes();
    const transform = getTransform();

    return {
      id: materialId.value,
      clientRect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
      borderRadius: {
        topLeft: attrs.radiusTL,
        topRight: attrs.radiusTR,
        bottomRight: attrs.radiusBR,
        bottomLeft: attrs.radiusBL,
      },
      blur: attrs.blur,
      thickness: attrs.thickness,
      refractIndex: attrs.refractIndex,
      refractIntensity: attrs.refractIntensity,
      dispersion: attrs.dispersion,
      transform: {
        scaleX: transform.scaleX,
        scaleY: transform.scaleY,
        translateX: transform.translateX,
        translateY: transform.translateY,
      },
    };
  };

  /**
   * Check if the bounding rect has changed significantly
   */
  const hasRectChanged = (newRect: DOMRect): boolean => {
    if (!lastClientRect) return true;

    const threshold = 0.5; // Half pixel tolerance
    return (
      Math.abs(newRect.left - lastClientRect.left) > threshold
      || Math.abs(newRect.top - lastClientRect.top) > threshold
      || Math.abs(newRect.width - lastClientRect.width) > threshold
      || Math.abs(newRect.height - lastClientRect.height) > threshold
    );
  };

  /**
   * RAF loop for syncing position with proxy target
   */
  const syncLoop = () => {
    if (!isDelegating.value || !proxyTarget.value || !element.value) {
      rafId = null;
      return;
    }

    const rect = element.value.getBoundingClientRect();

    if (hasRectChanged(rect)) {
      lastClientRect = rect;

      const config = buildConfig();
      if (config) {
        proxyTarget.value.updateExternalMaterial(materialId.value, {
          clientRect: config.clientRect,
          transform: config.transform,
        });
      }
    }

    rafId = requestAnimationFrame(syncLoop);
  };

  /**
   * Start the position sync loop
   */
  const startSyncLoop = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(syncLoop);
  };

  /**
   * Stop the position sync loop
   */
  const stopSyncLoop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  /**
   * Handle feedback from proxy target
   */
  const handleFeedback = (feedback: ExternalMaterialFeedback) => {
    proxyFeedback.value = feedback;
  };

  /**
   * Set or clear the proxy target
   */
  const setProxyTarget = (target: ProxyTargetInterface | null) => {
    // Clean up previous target
    if (proxyTarget.value && materialId.value) {
      proxyTarget.value.unregisterExternalMaterial(materialId.value);
      if (feedbackUnsubscribe) {
        feedbackUnsubscribe();
        feedbackUnsubscribe = null;
      }
      stopSyncLoop();
    }

    proxyTarget.value = target;

    if (target && element.value && materialElement.value) {
      // Generate a unique ID for this material's delegation
      materialId.value = `ext-${materialElement.value.materialId}`;

      // Register with the new proxy target
      const config = buildConfig();
      if (config) {
        target.registerExternalMaterial(materialId.value, config);

        // Subscribe to feedback
        feedbackUnsubscribe = target.onMaterialFeedback(materialId.value, handleFeedback);

        // Mark as delegating and tell parent manager to skip this material
        isDelegating.value = true;
        markParentToSkip(true);

        // Start position sync
        startSyncLoop();
      }
    } else {
      isDelegating.value = false;
      markParentToSkip(false);
      proxyFeedback.value = null;
    }
  };

  /**
   * Tell the parent manager to skip or include this material in rendering
   */
  const markParentToSkip = (skip: boolean) => {
    if (!materialElement.value) return;

    // Store skip state on the material element for the manager to check
    materialElement.value.isDelegatedToProxy = skip;

    // Request re-render so parent updates its material list
    parentManager.markTextureDirty();
  };

  /**
   * Force update the delegation state (call when config changes)
   */
  const updateDelegation = () => {
    if (!isDelegating.value || !proxyTarget.value) return;

    const config = buildConfig();
    if (config) {
      proxyTarget.value.updateExternalMaterial(materialId.value, config);
    }
  };

  // Watch for glass attribute changes
  const glassAttrsComputed = computed(() => getGlassAttributes());
  watch(glassAttrsComputed, () => {
    updateDelegation();
  }, { deep: true });

  // Cleanup on unmount
  onUnmounted(() => {
    if (proxyTarget.value && materialId.value) {
      proxyTarget.value.unregisterExternalMaterial(materialId.value);
    }
    if (feedbackUnsubscribe) {
      feedbackUnsubscribe();
    }
    stopSyncLoop();
  });

  return {
    isDelegating,
    setProxyTarget,
    proxyFeedback,
    updateDelegation,
  };
}
