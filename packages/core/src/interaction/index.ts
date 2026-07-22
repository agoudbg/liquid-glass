export type {
  InteractionConfig,
  InteractionPreset,
  PartialInteractionConfig,
  SpringConfig,
} from '../types/interaction';
export {
  createButtonEngine,
  createContextMenuEngine,
  createCustomEngine,
  createSliderEngine,
} from './factories';
export { InteractionEngine } from './InteractionEngine';
export type { OriginShiftResult } from './origin';
export { calculateOriginShift } from './origin';
export {
  BOUNCY_SPRING,
  BUTTON_PRESET,
  CONTEXT_MENU_PRESET,
  DEFAULT_SPRING,
  PRESET_MAP,
  SLIDER_PRESET,
  SNAPPY_SPRING,
  SOFT_SPRING,
} from './presets';
export type { SpringStepResult } from './spring';
export { isSpringAtRest, springStep } from './spring';
export type { StretchResult } from './stretch';
export { calculateStretch } from './stretch';
export type {
  IdleReturnTarget,
  InteractionElementSize,
  InteractionEngineState,
  InteractionPhase,
  InteractionPhaseCallback,
  InteractionPoint,
  InteractionTransform,
  PointerData,
  TransformUpdateCallback,
} from './types';
