/**
 * useMaterialDelegation.ts - 材质渲染委托组合式函数
 * ===================================================
 *
 * 当一个 LiquidGlassMaterial 视觉上位于嵌套的 LiquidGlass 上方时，
 * 父级 LiquidGlass 不应该渲染该材质的玻璃效果，而是应该由子级
 * LiquidGlass（已经拥有正确的背景纹理）作为代理来渲染。
 *
 * 使用场景：
 * - 固定定位的工具栏覆盖在可滚动的 LiquidGlass 区域上
 * - 弹出层/模态框需要使用底层 LiquidGlass 的背景进行折射
 *
 * 工作流程：
 * 1. Material 通过 proxyTarget 指定代理 LiquidGlass
 * 2. 代理接收材质配置并在其渲染管线中渲染玻璃效果
 * 3. 代理返回主题颜色等反馈信息给 Material
 * 4. RAF 循环持续同步 Material 的位置变化
 */

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

// ===== 类型定义 =====

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

// ===== 主函数 =====

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

  // ===== 状态变量 =====
  const proxyTarget = shallowRef<ProxyTargetInterface | null>(null);
  const isDelegating = ref(false);
  const proxyFeedback = ref<ExternalMaterialFeedback | null>(null);
  const materialId = ref<string>('');

  // Cleanup function for feedback subscription
  let feedbackUnsubscribe: (() => void) | null = null;

  // RAF loop for position sync
  let rafId: number | null = null;
  let lastClientRect: DOMRect | null = null;

  // ===== 配置构建 =====

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

  // ===== 位置同步 RAF 循环 =====

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
   * RAF loop for syncing position with proxy target.
   * Continuously checks if the material's position has changed and
   * updates the proxy target accordingly.
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

  /** Start the position sync loop */
  const startSyncLoop = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(syncLoop);
  };

  /** Stop the position sync loop */
  const stopSyncLoop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  // ===== 代理目标管理 =====

  /**
   * Handle feedback from proxy target
   */
  const handleFeedback = (feedback: ExternalMaterialFeedback) => {
    proxyFeedback.value = feedback;
  };

  /**
   * Set or clear the proxy target.
   * This is the main entry point for establishing delegation.
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

  // ===== 父级管理器通知 =====

  /**
   * Tell the parent manager to skip or include this material in rendering.
   * When delegating, the parent should not render this material's glass effect.
   */
  const markParentToSkip = (skip: boolean) => {
    if (!materialElement.value) return;

    // Store skip state on the material element for the manager to check
    materialElement.value.isDelegatedToProxy = skip;

    // Request re-render so parent updates its material list
    parentManager.markTextureDirty('external');
  };

  // ===== 更新与清理 =====

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

  // Watch for glass attribute changes and update delegation
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

  // ===== 返回接口 =====

  return {
    isDelegating,
    setProxyTarget,
    proxyFeedback,
    updateDelegation,
  };
}
