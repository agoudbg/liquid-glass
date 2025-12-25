import { onUnmounted, reactive, type Ref } from 'vue';

import { ExternalMaterialElement } from '../core/ExternalMaterialElement';
import type { LiquidRendererManager } from '../core/LiquidRendererManager';
import type {
  ExternalMaterialCanvasCoords,
  ExternalMaterialConfig,
  ExternalMaterialFeedback,
  ProxyTargetInterface,
} from '../types/ExternalMaterial';

export interface UseExternalRendererOptions {
  /** The LiquidRendererManager instance for this LiquidGlass */
  manager: LiquidRendererManager;

  /** The container element of this LiquidGlass */
  container: Ref<HTMLElement | null>;
}

export interface UseExternalRendererReturn {
  /** The proxy target interface to expose to external materials */
  proxyInterface: ProxyTargetInterface;

  /** Map of registered external materials */
  externalMaterials: Map<string, ExternalMaterialConfig>;

  /** Calculate canvas coordinates for an external material */
  calculateCanvasCoords: (config: ExternalMaterialConfig) => ExternalMaterialCanvasCoords;
}

/**
 * Composable for LiquidGlass to handle rendering external materials (from parent containers).
 *
 * When a material from a parent LiquidGlass is positioned over this (child) LiquidGlass,
 * this composable handles:
 * 1. Receiving material configurations from delegating materials
 * 2. Creating virtual ExternalMaterialElement instances
 * 3. Registering them with the manager for WebGL rendering
 */
export function useExternalRenderer(
  options: UseExternalRendererOptions,
): UseExternalRendererReturn {
  const { manager, container } = options;

  // Store for external material configs
  const externalMaterials = reactive(new Map<string, ExternalMaterialConfig>());

  // Store for virtual material elements (registered with manager)
  const externalMaterialElements = new Map<string, ExternalMaterialElement>();

  // Callbacks for feedback to materials
  const feedbackCallbacks = new Map<string, Set<(feedback: ExternalMaterialFeedback) => void>>();

  /**
   * Get the container's bounding rect
   */
  const getContainerRect = (): DOMRect | null => {
    if (!container.value) return null;
    return container.value.getBoundingClientRect();
  };

  /**
   * Get the current scroll position
   */
  const getScrollPosition = (): { x: number; y: number } => ({
    x: manager.scroll.x,
    y: manager.scroll.y,
  });

  /**
   * Register a new external material
   */
  const registerExternalMaterial = (id: string, config: ExternalMaterialConfig) => {
    externalMaterials.set(id, config);
    manager.log('debug', `[ExternalRenderer] Registering external material: ${id}`);

    // Create a virtual material element and register with manager
    const element = new ExternalMaterialElement(manager, id, config);

    // Set up feedback callback
    element.setFeedbackCallback((mode) => {
      const feedback: ExternalMaterialFeedback = { themeColorMode: mode };
      const callbacks = feedbackCallbacks.get(id);
      if (callbacks) {
        callbacks.forEach((cb) => cb(feedback));
      }
    });

    externalMaterialElements.set(id, element);

    // Register with manager (will be rendered like a normal material)
    manager.registerMaterialElement(element as any);

    manager.log('debug', `[ExternalRenderer] Registered external material: ${id}`);
  };

  /**
   * Update an existing external material
   */
  const updateExternalMaterial = (id: string, data: Partial<ExternalMaterialConfig>) => {
    const existing = externalMaterials.get(id);
    if (!existing) {
      manager.log('warn', `[ExternalRenderer] Cannot update non-existent material: ${id}`);
      return;
    }

    // Merge the update
    const updated: ExternalMaterialConfig = {
      ...existing,
      ...data,
      clientRect: data.clientRect
        ? { ...existing.clientRect, ...data.clientRect }
        : existing.clientRect,
      borderRadius: data.borderRadius
        ? { ...existing.borderRadius, ...data.borderRadius }
        : existing.borderRadius,
      transform: data.transform
        ? { ...existing.transform, ...data.transform }
        : existing.transform,
    };

    externalMaterials.set(id, updated);

    // Update the virtual element
    const element = externalMaterialElements.get(id);
    if (element) {
      element.updateFromConfig(updated);
    }

    // Trigger re-render
    manager.markTextureDirty();
  };

  /**
   * Unregister an external material
   */
  const unregisterExternalMaterial = (id: string) => {
    externalMaterials.delete(id);
    feedbackCallbacks.delete(id);

    // Destroy and remove the virtual element
    const element = externalMaterialElements.get(id);
    if (element) {
      element.destroy();
      externalMaterialElements.delete(id);
    }

    manager.log('debug', `[ExternalRenderer] Unregistered external material: ${id}`);

    // Trigger re-render
    manager.markTextureDirty();
  };

  /**
   * Subscribe to feedback for a material
   */
  const onMaterialFeedback = (
    id: string,
    callback: (feedback: ExternalMaterialFeedback) => void,
  ): (() => void) => {
    if (!feedbackCallbacks.has(id)) {
      feedbackCallbacks.set(id, new Set());
    }
    feedbackCallbacks.get(id)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = feedbackCallbacks.get(id);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          feedbackCallbacks.delete(id);
        }
      }
    };
  };

  /**
   * Calculate canvas coordinates for an external material
   */
  const calculateCanvasCoords = (config: ExternalMaterialConfig): ExternalMaterialCanvasCoords => {
    const containerRect = getContainerRect();
    if (!containerRect) {
      return {
        destX: 0,
        destY: 0,
        srcX: 0,
        srcY: 0,
        width: 0,
        height: 0,
        isVisible: false,
      };
    }

    const scroll = getScrollPosition();
    const { clientRect, transform } = config;

    // Remove transform effects to get the "natural" position
    const safeScaleX = transform.scaleX === 0 ? 1 : transform.scaleX;
    const safeScaleY = transform.scaleY === 0 ? 1 : transform.scaleY;

    const naturalWidth = clientRect.width / safeScaleX;
    const naturalHeight = clientRect.height / safeScaleY;
    const scaleOffsetX = (clientRect.width - naturalWidth) / 2;
    const scaleOffsetY = (clientRect.height - naturalHeight) / 2;

    // Convert viewport coordinates to container-relative coordinates
    const relativeX = clientRect.x - containerRect.left - transform.translateX + scaleOffsetX;
    const relativeY = clientRect.y - containerRect.top - transform.translateY + scaleOffsetY;

    // Apply scroll offset to get canvas coordinates
    const destX = relativeX + scroll.x;
    const destY = relativeY + scroll.y;

    // Source coordinates in the backdrop canvas are the same
    const srcX = destX;
    const srcY = destY;

    // Check visibility (at least partially within container bounds)
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    const isVisible = !(
      relativeX + naturalWidth < 0
      || relativeY + naturalHeight < 0
      || relativeX > containerWidth
      || relativeY > containerHeight
    );

    return {
      destX,
      destY,
      srcX,
      srcY,
      width: naturalWidth,
      height: naturalHeight,
      isVisible,
    };
  };

  // Build the proxy interface
  const proxyInterface: ProxyTargetInterface = {
    registerExternalMaterial,
    updateExternalMaterial,
    unregisterExternalMaterial,
    getContainerRect,
    getScrollPosition,
    onMaterialFeedback,
  };

  // Cleanup on unmount
  onUnmounted(() => {
    // Destroy all external material elements
    externalMaterialElements.forEach((element) => {
      element.destroy();
    });
    externalMaterialElements.clear();
    externalMaterials.clear();
    feedbackCallbacks.clear();
  });

  return {
    proxyInterface,
    externalMaterials,
    calculateCanvasCoords,
  };
}
