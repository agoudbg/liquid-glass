import { inject, InjectionKey, provide } from 'vue';

import { LiquidRendererManager } from './LiquidRendererManager';

export const LiquidContextKey: InjectionKey<LiquidRendererManager> = Symbol('LiquidContext');

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
