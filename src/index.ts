import LgBackdropCanvas from './components/LgBackdropCanvas.vue';
import LgBackdropConverter from './components/LgBackdropConverter.vue';
import LiquidGlass from './components/LiquidGlass.vue';
import LiquidGlassDebugger from './components/LiquidGlassDebugger.vue';
import LiquidGlassMaterial from './components/LiquidGlassMaterial.vue';

export {
  LgBackdropConverter,
  LgBackdropCanvas,
  LiquidGlassDebugger,
  LiquidGlass,
  LiquidGlassMaterial,
};

export * from './types/LiquidGlass';
export * from './types/ExternalMaterial';
export { useMaterialDelegation } from './composables/useMaterialDelegation';
export { useExternalRenderer } from './composables/useExternalRenderer';

// Interaction Engine exports
export {
  InteractionEngine,
  createButtonEngine,
  createContextMenuEngine,
  createSliderEngine,
  createCustomEngine,
  BUTTON_PRESET,
  CONTEXT_MENU_PRESET,
  SLIDER_PRESET,
  PRESET_MAP,
  DEFAULT_SPRING,
  SNAPPY_SPRING,
  SOFT_SPRING,
  BOUNCY_SPRING,
} from './core/InteractionEngine';
