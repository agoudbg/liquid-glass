import type { InjectionKey } from 'vue';
import { inject } from 'vue';

import type { LiquidGlassInjection } from '../types';

/** Injection key used by the Vue adapter's component tree. */
export const LIQUID_GLASS_CONTEXT_KEY: InjectionKey<LiquidGlassInjection> = Symbol(
  'liquid-glass-context',
);

/**
 * Resolve the nearest liquid-glass container.
 *
 * @returns Reactive core context owned by the nearest `LiquidGlass` component.
 * @throws Error when used outside a `LiquidGlass` component.
 */
export function useLiquidGlassContext(): LiquidGlassInjection {
  const injection = inject(LIQUID_GLASS_CONTEXT_KEY);
  if (!injection) {
    throw new Error('Liquid glass components must be nested inside <LiquidGlass>.');
  }
  return injection;
}
