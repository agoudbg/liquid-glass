import { createContext, useContext } from 'solid-js';

import type { LiquidGlassContextValue } from './types';

/** Solid context shared by adapter components. */
export const LiquidGlassContext = createContext<LiquidGlassContextValue>();

/**
 * Resolve the nearest Solid liquid-glass container.
 *
 * @returns Reactive core context accessor.
 * @throws Error when used outside a `LiquidGlass` component.
 */
export function useLiquidGlassContext(): LiquidGlassContextValue {
  const value = useContext(LiquidGlassContext);
  if (!value) {
    throw new Error('Liquid glass components must be nested inside <LiquidGlass>.');
  }
  return value;
}
