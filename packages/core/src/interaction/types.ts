import type { InteractionOutput } from '../types/interaction';

/** Animation phases emitted by the interaction engine. */
export type InteractionPhase = 'idle' | 'hover' | 'active' | 'releasing';

/** Pointer coordinates consumed by the interaction engine. */
export interface PointerData {
  /** Horizontal coordinate in client space. */
  clientX: number;
  /** Vertical coordinate in client space. */
  clientY: number;
  /** Browser pointer identifier, when available. */
  pointerId?: number;
  /** Browser pointer type, such as `mouse`, `touch`, or `pen`. */
  pointerType?: string;
  /** Horizontal position normalized to the material bounds. */
  normalizedX?: number;
  /** Vertical position normalized to the material bounds. */
  normalizedY?: number;
}

/** Legacy-compatible name for the public interaction output contract. */
export type InteractionTransform = InteractionOutput;

/** Two-dimensional point used by pointer tracking. */
export interface InteractionPoint {
  /** Horizontal coordinate. */
  x: number;
  /** Vertical coordinate. */
  y: number;
}

/** Transform target retained while a held interaction settles. */
export interface IdleReturnTarget {
  /** Target horizontal scale. */
  scaleX: number;
  /** Target vertical scale. */
  scaleY: number;
  /** Target horizontal translation. */
  translateX: number;
  /** Target vertical translation. */
  translateY: number;
  /** Target horizontal transform origin. */
  originX: number;
  /** Target vertical transform origin. */
  originY: number;
}

/** Complete mutable state snapshot maintained by an interaction engine. */
export interface InteractionEngineState {
  /** Whether a pointer currently owns an active press. */
  isPointerDown: boolean;
  /** Whether a mouse pointer currently hovers the material. */
  isHovering: boolean;
  /** Active browser pointer identifier. */
  pointerId: number | undefined;
  /** Pointer position at the start of the current gesture. */
  pointerOrigin: InteractionPoint | null;
  /** Most recent pointer position. */
  currentPointer: InteractionPoint | null;
  /** Pointer position preceding the most recent sample. */
  previousPointer: InteractionPoint | null;
  /** Current animation phase. */
  phase: InteractionPhase;
  /** Current horizontal scale. */
  scaleX: number;
  /** Current vertical scale. */
  scaleY: number;
  /** Current horizontal translation. */
  translateX: number;
  /** Current vertical translation. */
  translateY: number;
  /** Current horizontal transform origin. */
  originX: number;
  /** Current vertical transform origin. */
  originY: number;
  /** Current opacity. */
  opacity: number;
  /** Target horizontal scale. */
  targetScaleX: number;
  /** Target vertical scale. */
  targetScaleY: number;
  /** Target horizontal translation. */
  targetTranslateX: number;
  /** Target vertical translation. */
  targetTranslateY: number;
  /** Target horizontal transform origin. */
  targetOriginX: number;
  /** Target vertical transform origin. */
  targetOriginY: number;
  /** Target opacity. */
  targetOpacity: number;
  /** Horizontal-scale spring velocity. */
  velocityScaleX: number;
  /** Vertical-scale spring velocity. */
  velocityScaleY: number;
  /** Horizontal-translation spring velocity. */
  velocityTranslateX: number;
  /** Vertical-translation spring velocity. */
  velocityTranslateY: number;
  /** Horizontal-origin spring velocity. */
  velocityOriginX: number;
  /** Vertical-origin spring velocity. */
  velocityOriginY: number;
  /** Opacity spring velocity. */
  velocityOpacity: number;
  /** Current normalized horizontal highlight position. */
  highlightX: number;
  /** Current normalized vertical highlight position. */
  highlightY: number;
  /** Whether the highlight is visible. */
  highlightVisible: boolean;
  /** Target normalized horizontal highlight position. */
  highlightTargetX: number;
  /** Target normalized vertical highlight position. */
  highlightTargetY: number;
  /** Horizontal pointer velocity normalized to a 16 ms frame. */
  pointerVelocityX: number;
  /** Vertical pointer velocity normalized to a 16 ms frame. */
  pointerVelocityY: number;
  /** Clock time of the latest pointer movement. */
  lastMoveTime: number;
  /** Optional intermediate target used by partial idle return. */
  idleReturnTarget: IdleReturnTarget | null;
  /** Current interaction-driven background. */
  backgroundColor: string | null;
  /** Target interaction-driven background. */
  targetBackgroundColor: string | null;
}

/** Material dimensions used by stretch and transform-origin calculations. */
export interface InteractionElementSize {
  /** Material width in CSS pixels. */
  width: number;
  /** Material height in CSS pixels. */
  height: number;
}

/** Callback invoked after the engine produces a transform. */
export type TransformUpdateCallback = (transform: InteractionTransform) => void;

/** Callback invoked whenever the interaction phase changes. */
export type InteractionPhaseCallback = (phase: InteractionPhase) => void;
