/**
 * Stable interaction preset names inherited from the reference implementation.
 */
export type InteractionPreset = 'button' | 'context-menu' | 'slider' | 'custom';

/**
 * Parameters for the semi-implicit spring integrator.
 */
export interface SpringConfig {
  /** Spring stiffness. */
  stiffness: number;
  /** Velocity damping coefficient. */
  damping: number;
  /** Simulated mass. */
  mass: number;
}

/**
 * Complete configuration consumed by the interaction engine.
 */
export interface InteractionConfig {
  /** Optional preset identity retained after resolving overrides. */
  preset?: InteractionPreset;
  /** Scale while no pointer interaction is active. */
  baseScale: number;
  /** Scale while a mouse pointer hovers the material. */
  hoverScale: number;
  /** Scale while a pointer is pressed. */
  activeScale: number;
  /** Upper bound for either scale axis. */
  maxScale: number;
  /** Whether hover position influences translation. */
  enableHoverFollow: boolean;
  /** Fraction of hover displacement applied to translation. */
  hoverFollowFactor: number;
  /** Maximum hover translation in pixels. */
  hoverFollowMaxDistance: number;
  /** Fraction of drag displacement applied to translation. */
  translateFactor: number;
  /** Maximum horizontal drag translation in pixels. */
  maxTranslate: number;
  /** Optional vertical translation bound. */
  maxTranslateY?: number;
  /** Drag-to-stretch multiplier. */
  stretchFactor: number;
  /** Maximum additive stretch. */
  stretchLimit: number;
  /** Whether perpendicular compression preserves apparent area. */
  preserveArea: boolean;
  /** Whether pointer velocity, rather than displacement, drives stretch. */
  velocityStretch?: boolean;
  /** Velocity-to-stretch multiplier. */
  velocityStretchFactor?: number;
  /** Whether movement of the material alone drives stretch. */
  ignorePointerPosition?: boolean;
  /** Whether drag changes the transform origin. */
  enableOriginShift: boolean;
  /** Transform-origin response multiplier. */
  originShiftSensitivity: number;
  /** Whether a held pointer settles after inactivity. */
  enableIdleReturn: boolean;
  /** Milliseconds before the held state begins settling. */
  idleReturnDelay: number;
  /** Whether the held state settles only partway. */
  idleReturnPartial: boolean;
  /** Portion of the displacement removed by partial return. */
  idleReturnRatio?: number;
  /** Whether hover scale remains while translation settles. */
  keepScaleOnIdleReturn?: boolean;
  /** Whether displacement calculations use pixels instead of relative size. */
  useAbsoluteValues?: boolean;
  /** Spring used during hover transitions. */
  hoverSpring: SpringConfig;
  /** Spring used while the pointer is active. */
  activeSpring: SpringConfig;
  /** Spring used after release. */
  releaseSpring: SpringConfig;
  /** Whether pointer-driven highlight output is enabled. */
  showHighlight: boolean;
  /** Highlight diameter in pixels. */
  highlightSize: number;
  /** Highlight alpha. */
  highlightOpacity: number;
  /** Highlight brightness multiplier. */
  highlightHDRFactor: number;
  /** Highlight interpolation factor. */
  highlightFollowSpeed: number;
  /** Optional material opacity while active. */
  activeOpacity?: number;
  /** Whether opacity changes during interaction. */
  enableOpacityTransition?: boolean;
  /** Optional material background while active. */
  activeBackgroundColor?: string;
  /** Whether the active background is applied. */
  enableBackgroundTransition?: boolean;
  /** Position epsilon used to declare a spring settled. */
  restThreshold: number;
  /** Velocity epsilon used to declare a spring settled. */
  velocityThreshold: number;
}

/**
 * Overrides applied on top of an interaction preset.
 */
export type PartialInteractionConfig = Partial<InteractionConfig>;

/**
 * Latest pointer sample passed from a framework adapter into core.
 */
export interface PointerState {
  /** Whether the pointer currently owns an active press. */
  isActive: boolean;
  /** Whether a hover-capable pointer remains over the material. */
  isHovering: boolean;
  /** Client-space horizontal coordinate. */
  clientX: number;
  /** Client-space vertical coordinate. */
  clientY: number;
  /** Browser pointer identifier. */
  pointerId?: number;
  /** Browser pointer type, such as `mouse`, `touch`, or `pen`. */
  pointerType?: string;
  /** Horizontal position normalized to the material bounds. */
  normalizedX?: number;
  /** Vertical position normalized to the material bounds. */
  normalizedY?: number;
  /** Pointer pressure when supplied by the browser. */
  pressure?: number;
  /** Pointer angle in radians when supplied by an adapter. */
  angle?: number;
}

/**
 * One framework-provided interaction update.
 */
export interface InteractionState {
  /** Current pointer sample. */
  pointerState: PointerState;
  /** Current material bounds. */
  elementRect: DOMRectReadOnly;
}

/**
 * Transform and presentation values produced by the interaction engine.
 */
export interface InteractionOutput {
  /** Horizontal scale. */
  scaleX: number;
  /** Vertical scale. */
  scaleY: number;
  /** Horizontal translation in pixels. */
  translateX: number;
  /** Vertical translation in pixels. */
  translateY: number;
  /** Horizontal transform origin as a percentage. */
  originX: number;
  /** Vertical transform origin as a percentage. */
  originY: number;
  /** Material opacity. */
  opacity: number;
  /** Optional interaction-driven CSS background. */
  backgroundColor: string | null;
  /** Normalized horizontal highlight position. */
  highlightX: number;
  /** Normalized vertical highlight position. */
  highlightY: number;
  /** Whether the highlight should be shown. */
  highlightVisible: boolean;
  /** Whether an active pointer currently drives the output. */
  isActive: boolean;
}
