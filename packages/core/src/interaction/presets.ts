import type {
  InteractionConfig,
  InteractionPreset,
  SpringConfig,
} from '../types/interaction';

/** Balanced legacy spring used for active and release transitions. */
export const DEFAULT_SPRING: SpringConfig = {
  stiffness: 180,
  damping: 18,
  mass: 1,
};

/** Fast legacy spring used for context-menu press feedback. */
export const SNAPPY_SPRING: SpringConfig = {
  stiffness: 280,
  damping: 24,
  mass: 1,
};

/** Gentle legacy spring used by low-motion hover states. */
export const SOFT_SPRING: SpringConfig = {
  stiffness: 120,
  damping: 14,
  mass: 1,
};

/** Under-damped legacy spring used for elastic release feedback. */
export const BOUNCY_SPRING: SpringConfig = {
  stiffness: 200,
  damping: 10,
  mass: 1,
};

/** Legacy button interaction preset. */
export const BUTTON_PRESET: InteractionConfig = {
  preset: 'button',
  baseScale: 1,
  hoverScale: 1.02,
  activeScale: 1.05,
  maxScale: 1.5,
  enableHoverFollow: true,
  hoverFollowFactor: 0.08,
  hoverFollowMaxDistance: 150,
  translateFactor: 0.08,
  maxTranslate: 300,
  maxTranslateY: 400,
  stretchFactor: 0.0004,
  stretchLimit: 0.5,
  preserveArea: true,
  useAbsoluteValues: true,
  enableOriginShift: true,
  originShiftSensitivity: 0.5,
  enableIdleReturn: true,
  idleReturnDelay: 500,
  idleReturnPartial: false,
  keepScaleOnIdleReturn: true,
  hoverSpring: {
    stiffness: 200,
    damping: 18,
    mass: 1,
  },
  activeSpring: DEFAULT_SPRING,
  releaseSpring: BOUNCY_SPRING,
  showHighlight: true,
  highlightSize: 200,
  highlightOpacity: 0.5,
  highlightHDRFactor: 1.2,
  highlightFollowSpeed: 0.15,
  restThreshold: 0.001,
  velocityThreshold: 0.001,
};

/** Legacy context-menu interaction preset. */
export const CONTEXT_MENU_PRESET: InteractionConfig = {
  preset: 'context-menu',
  baseScale: 1,
  hoverScale: 1,
  activeScale: 1.01,
  maxScale: 1.5,
  enableHoverFollow: false,
  hoverFollowFactor: 0,
  hoverFollowMaxDistance: 0,
  translateFactor: 0.05,
  maxTranslate: 200,
  maxTranslateY: 300,
  stretchFactor: 0.0005,
  stretchLimit: 0.5,
  preserveArea: true,
  useAbsoluteValues: true,
  enableOriginShift: true,
  originShiftSensitivity: 0.6,
  enableIdleReturn: true,
  idleReturnDelay: 500,
  idleReturnPartial: true,
  idleReturnRatio: 0.5,
  keepScaleOnIdleReturn: true,
  hoverSpring: SOFT_SPRING,
  activeSpring: SNAPPY_SPRING,
  releaseSpring: DEFAULT_SPRING,
  showHighlight: true,
  highlightSize: 180,
  highlightOpacity: 0.4,
  highlightHDRFactor: 1.1,
  highlightFollowSpeed: 0.2,
  restThreshold: 0.001,
  velocityThreshold: 0.001,
};

/** Legacy slider interaction preset. */
export const SLIDER_PRESET: InteractionConfig = {
  preset: 'slider',
  baseScale: 1,
  hoverScale: 1,
  activeScale: 1.15,
  maxScale: 1.8,
  enableHoverFollow: false,
  hoverFollowFactor: 0,
  hoverFollowMaxDistance: 0,
  translateFactor: 0,
  maxTranslate: 0,
  stretchFactor: 0.003,
  stretchLimit: 0.8,
  preserveArea: true,
  velocityStretch: true,
  velocityStretchFactor: 0.025,
  ignorePointerPosition: true,
  useAbsoluteValues: true,
  enableOriginShift: false,
  originShiftSensitivity: 0,
  enableIdleReturn: false,
  idleReturnDelay: 0,
  idleReturnPartial: false,
  keepScaleOnIdleReturn: false,
  hoverSpring: SOFT_SPRING,
  activeSpring: BOUNCY_SPRING,
  releaseSpring: {
    stiffness: 180,
    damping: 8,
    mass: 1,
  },
  showHighlight: false,
  highlightSize: 0,
  highlightOpacity: 0,
  highlightHDRFactor: 1,
  highlightFollowSpeed: 0,
  activeBackgroundColor: 'transparent',
  enableBackgroundTransition: true,
  restThreshold: 0.002,
  velocityThreshold: 0.002,
};

/** Preset lookup preserving the reference implementation's shared object identities. */
export const PRESET_MAP: Record<InteractionPreset, InteractionConfig> = {
  button: BUTTON_PRESET,
  'context-menu': CONTEXT_MENU_PRESET,
  slider: SLIDER_PRESET,
  custom: BUTTON_PRESET,
};
