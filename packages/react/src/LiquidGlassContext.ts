import type { GlassContext } from '@agou/liquid-glass-core';
import { createContext, useContext } from 'react';

/** Context value provided by a mounted React `LiquidGlass`. */
export interface LiquidGlassContextValue {
  /** Mounted framework-neutral context, or null before the first effect. */
  context: GlassContext | null;
}

/** React context shared by adapter components. */
export const LiquidGlassContext = createContext<LiquidGlassContextValue | null>(null);

/**
 * Resolve the nearest React liquid-glass container.
 *
 * @returns Mounted context wrapper.
 * @throws Error when used outside a `LiquidGlass` component.
 */
export function useLiquidGlassContext(): LiquidGlassContextValue {
  const value = useContext(LiquidGlassContext);
  if (!value) {
    throw new Error('Liquid glass components must be nested inside <LiquidGlass>.');
  }
  return value;
}
