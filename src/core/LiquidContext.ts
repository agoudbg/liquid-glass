/**
 * @fileoverview Vue Context (Provide/Inject) for Liquid Glass components.
 *
 * This module provides the dependency injection mechanism for Liquid Glass.
 * Each `<LiquidGlass>` component provides a LiquidRendererManager via Vue's
 * provide/inject system, allowing child components to access it.
 *
 * Key Concepts:
 * - **LiquidContext**: The manager instance shared between parent and children
 * - **LiquidDepth**: Nesting level (0 = root, 1 = first nested, etc.)
 *
 * Usage:
 * ```vue
 * <!-- In LiquidGlass.vue (parent) -->
 * <script setup>
 * const manager = new LiquidRendererManager(options);
 * provideLiquidContext(manager);
 * provideLiquidDepth(currentDepth + 1);
 * </script>
 *
 * <!-- In LiquidGlassMaterial.vue (child) -->
 * <script setup>
 * const manager = useLiquidContext();
 * // manager is now available
 * </script>
 * ```
 *
 * @module LiquidContext
 */

import { inject, InjectionKey, provide } from 'vue';

import { LiquidRendererManager } from './LiquidRendererManager';

// ============================================================================
// INJECTION KEYS
// ============================================================================

/**
 * Injection key for the LiquidRendererManager instance.
 * Used by child components to access the nearest parent manager.
 */
export const LiquidContextKey: InjectionKey<LiquidRendererManager> = Symbol('LiquidContext');

/**
 * Injection key for the nesting depth.
 * Used to track how many LiquidGlass layers are stacked.
 */
export const LiquidDepthKey: InjectionKey<number> = Symbol('LiquidDepth');

// ============================================================================
// CONTEXT HOOKS
// ============================================================================

/**
 * Get the nearest LiquidRendererManager from context.
 *
 * Must be called within a component that is a descendant of `<LiquidGlass>`.
 *
 * @returns The LiquidRendererManager instance
 * @throws Error if called outside of a LiquidGlass context
 *
 * @example
 * const manager = useLiquidContext();
 * manager.markTextureDirty('layout');
 */
export function useLiquidContext() {
  const context = inject(LiquidContextKey);
  if (!context) {
    throw new Error('useLiquidContext must be used within a LiquidGlass');
  }
  return context;
}

/**
 * Provide a LiquidRendererManager to descendant components.
 *
 * Called by `<LiquidGlass>` during setup to make the manager available
 * to all child components.
 *
 * @param manager - The manager instance to provide
 *
 * @example
 * const manager = new LiquidRendererManager(options);
 * provideLiquidContext(manager);
 */
export function provideLiquidContext(manager: LiquidRendererManager) {
  provide(LiquidContextKey, manager);
}

// ============================================================================
// DEPTH TRACKING
// ============================================================================

/**
 * Get the current nesting depth from context.
 *
 * Returns the depth of LiquidGlass nesting:
 * - -1 (default): Not inside any LiquidGlass
 * - 0: Inside the first (root) LiquidGlass
 * - 1: Inside a nested LiquidGlass
 * - etc.
 *
 * @param defaultDepth - Default value if not in a LiquidGlass context
 * @returns The current nesting depth
 */
export function useLiquidDepth(defaultDepth = -1) {
  return inject(LiquidDepthKey, defaultDepth);
}

/**
 * Provide the nesting depth to descendant components.
 *
 * Called by `<LiquidGlass>` during setup to track nesting level.
 *
 * @param depth - The depth value to provide
 */
export function provideLiquidDepth(depth: number) {
  provide(LiquidDepthKey, depth);
}
