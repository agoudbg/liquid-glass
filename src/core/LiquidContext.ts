import { inject, InjectionKey, provide } from 'vue';

import { LiquidRendererManager } from './LiquidRendererManager';

export const LiquidContextKey: InjectionKey<LiquidRendererManager> = Symbol('LiquidContext');
export const LiquidDepthKey: InjectionKey<number> = Symbol('LiquidDepth');

export function useLiquidContext() {
  const context = inject(LiquidContextKey);
  if (!context) {
    throw new Error('useLiquidContext must be used within a LiquidGlass');
  }
  return context;
}

export function provideLiquidContext(manager: LiquidRendererManager) {
  provide(LiquidContextKey, manager);
}

export function useLiquidDepth(defaultDepth = -1) {
  return inject(LiquidDepthKey, defaultDepth);
}

export function provideLiquidDepth(depth: number) {
  provide(LiquidDepthKey, depth);
}
