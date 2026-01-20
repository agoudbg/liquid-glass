/**
 * @fileoverview iOS 26-style Liquid Glass Interaction Engine
 *
 * This module provides a physics-based interaction system that mimics the
 * liquid glass effects found in iOS 26. It supports three main presets:
 *
 * 1. **Button Mode**: Responds to hover with slight enlargement and follows
 *    mouse movement with configurable lag. On press, enlarges significantly
 *    and allows content stretching based on drag distance. The scaling center
 *    shifts with drag.
 *
 * 2. **Context Menu Mode**: Does not respond to hover movement. On press,
 *    content stretches based on drag direction and distance. After inactivity,
 *    partially returns to rest position but maintains some offset while pressed.
 *
 * 3. **Slider Mode**: Enlarges on press with increased transparency. Horizontal
 *    drag compresses vertically and stretches horizontally (with elastic bounce).
 *    The scaling center remains fixed at the element center.
 *
 * All animations feature smooth spring physics with configurable damping and
 * bounce characteristics.
 *
 * @module core/InteractionEngine
 */

import type {
  InteractionConfig,
  InteractionPreset,
  InteractionState,
  InteractionTransform,
  PointerData,
  SpringConfig,
} from '../types/LiquidGlass';

// =============================================================================
// Spring Physics Utilities
// =============================================================================

/**
 * Calculates spring-based interpolation with overshoot (bounce) support.
 *
 * Uses a critically-damped or under-damped spring model based on the
 * damping ratio. Under-damped springs (ratio < 1) produce oscillation/bounce.
 *
 * @param current - Current value
 * @param target - Target value to spring towards
 * @param velocity - Current velocity (will be mutated)
 * @param config - Spring configuration
 * @param deltaTime - Time step in seconds
 * @returns Object containing new value and velocity
 */
export function springStep(
  current: number,
  target: number,
  velocity: number,
  config: SpringConfig,
  deltaTime: number,
): { value: number; velocity: number } {
  const { stiffness, damping, mass } = config;

  // Spring force: F = -k * (x - target)
  // Damping force: F = -c * v
  // Acceleration: a = F / m
  const displacement = current - target;
  const springForce = -stiffness * displacement;
  const dampingForce = -damping * velocity;
  const acceleration = (springForce + dampingForce) / mass;

  // Semi-implicit Euler integration (more stable than explicit)
  const newVelocity = velocity + acceleration * deltaTime;
  const newValue = current + newVelocity * deltaTime;

  return { value: newValue, velocity: newVelocity };
}

/**
 * Checks if a spring has settled (at rest).
 *
 * @param current - Current value
 * @param target - Target value
 * @param velocity - Current velocity
 * @param threshold - Position threshold for "at rest" detection
 * @param velocityThreshold - Velocity threshold for "at rest" detection
 * @returns True if the spring is at rest
 */
export function isSpringAtRest(
  current: number,
  target: number,
  velocity: number,
  threshold: number = 0.001,
  velocityThreshold: number = 0.001,
): boolean {
  return Math.abs(current - target) < threshold && Math.abs(velocity) < velocityThreshold;
}

/**
 * Calculates stretch factor based on movement direction and distance.
 *
 * iOS 26 behavior:
 * - Moving LEFT/RIGHT: stretch horizontally, compress vertically
 * - Moving UP/DOWN: stretch vertically, compress horizontally
 *
 * Enhanced to consider element aspect ratio to prevent disproportionate
 * deformation on elongated elements.
 *
 * @param dx - Horizontal displacement (positive = right, negative = left)
 * @param dy - Vertical displacement (positive = down, negative = up)
 * @param factor - Stretch intensity factor
 * @param limit - Maximum stretch amount
 * @param elementWidth - Element width in pixels (optional, for aspect ratio normalization)
 * @param elementHeight - Element height in pixels (optional, for aspect ratio normalization)
 * @returns Stretch values for X and Y axes
 */
export function calculateStretch(
  dx: number,
  dy: number,
  factor: number,
  limit: number,
  elementWidth: number = 1,
  elementHeight: number = 1,
): { stretchX: number; stretchY: number } {
  // Normalize displacement by element dimensions to prevent disproportionate
  // deformation on elongated elements. This makes a 50px drag on a 300px wide
  // element feel the same as a 50px drag on a 100px wide element.
  const normalizedDx = elementWidth > 0 ? dx / elementWidth : dx;
  const normalizedDy = elementHeight > 0 ? dy / elementHeight : dy;

  // Use normalized values for stretch calculation
  const absDx = Math.abs(normalizedDx);
  const absDy = Math.abs(normalizedDy);

  // Apply stretch based on normalized magnitude of movement
  // Scale by element size to maintain reasonable stretch regardless of element dimensions
  // The factor controls the overall sensitivity
  let stretchX = absDx * factor * 100;
  let stretchY = absDy * factor * 100;

  // Clamp to limits
  stretchX = Math.min(limit, stretchX);
  stretchY = Math.min(limit, stretchY);

  return { stretchX, stretchY };
}

/**
 * Calculates the transform origin shift based on drag offset.
 * Used to make scaling feel more natural during drag interactions.
 *
 * The origin shifts in the OPPOSITE direction of the drag, so that when
 * the element scales, it visually follows the finger/pointer direction.
 * This creates an iOS 26-style "pull" effect.
 *
 * @param dx - Horizontal drag offset from press origin
 * @param dy - Vertical drag offset from press origin
 * @param elementWidth - Element width in pixels
 * @param elementHeight - Element height in pixels
 * @param sensitivity - How much the origin shifts (higher = more movement)
 * @returns Origin offset as percentages (can be outside 0-100 for extreme shifts)
 */
export function calculateOriginShift(
  dx: number,
  dy: number,
  elementWidth: number,
  elementHeight: number,
  sensitivity: number,
): { originX: number; originY: number } {
  // Default origin is center (50%, 50%)
  // Shift OPPOSITE to drag direction for natural "pull" feel
  // When dragging right (dx > 0), origin moves left (negative)
  // When dragging down (dy > 0), origin moves up (negative)
  const shiftX = -(dx / elementWidth) * sensitivity * 100;
  const shiftY = -(dy / elementHeight) * sensitivity * 100;

  // Allow origin to extend beyond 0-100% for dramatic effects
  // Only clamp to prevent extreme values that might cause issues
  const originX = Math.max(-100, Math.min(200, 50 + shiftX));
  const originY = Math.max(-100, Math.min(200, 50 + shiftY));

  return { originX, originY };
}

// =============================================================================
// Preset Configurations
// =============================================================================

/**
 * Default spring configuration for smooth animations.
 * Balanced stiffness and damping for natural-feeling movement.
 */
export const DEFAULT_SPRING: SpringConfig = {
  stiffness: 180,
  damping: 18,
  mass: 1,
};

/**
 * Snappy spring configuration for quick responses.
 * Higher stiffness and damping for less bounce.
 */
export const SNAPPY_SPRING: SpringConfig = {
  stiffness: 280,
  damping: 24,
  mass: 1,
};

/**
 * Soft spring configuration for gentle animations.
 * Lower stiffness for more gradual movement.
 */
export const SOFT_SPRING: SpringConfig = {
  stiffness: 120,
  damping: 14,
  mass: 1,
};

/**
 * Bouncy spring configuration for playful animations.
 * Lower damping for more oscillation but controlled stiffness.
 */
export const BOUNCY_SPRING: SpringConfig = {
  stiffness: 200,
  damping: 10,
  mass: 1,
};

/**
 * Button preset configuration.
 *
 * Behavior:
 * - Slight scale up on hover (1.02x)
 * - Follows mouse with configurable lag while hovered
 * - Returns to center after idle period
 * - Larger scale on press (1.05x)
 * - Content stretches during drag based on distance
 * - Scaling center shifts with drag
 */
export const BUTTON_PRESET: InteractionConfig = {
  // Preset identifier
  preset: 'button',

  // Scale configuration
  baseScale: 1.0,
  hoverScale: 1.02,
  activeScale: 1.05,
  maxScale: 1.5, // Higher limit for area-preserving stretch

  // Translation configuration
  enableHoverFollow: true,
  hoverFollowFactor: 0.08,
  hoverFollowMaxDistance: 150, // Increased 10x from 15
  translateFactor: 0.08, // Reduced from 0.15 for less sensitive drag displacement
  maxTranslate: 300,
  maxTranslateY: 400,

  // Stretch configuration
  stretchFactor: 0.0004,
  stretchLimit: 0.5,
  preserveArea: true,

  // Absolute value mode - makes different sized elements feel more similar
  useAbsoluteValues: true, // Default enabled for consistent feel across element sizes

  // Origin shift configuration
  enableOriginShift: true,
  originShiftSensitivity: 0.5, // Reduced from 0.8 for less sensitive origin shift

  // Idle return configuration
  enableIdleReturn: true,
  idleReturnDelay: 500,
  idleReturnPartial: false,
  // New: Keep scale during idle return when hovering
  keepScaleOnIdleReturn: true,

  // Spring configuration (faster hover return ~3/5 of original)
  hoverSpring: {
    stiffness: 200,
    damping: 18,
    mass: 1,
  },
  activeSpring: DEFAULT_SPRING,
  releaseSpring: BOUNCY_SPRING,

  // Highlight configuration
  showHighlight: true,
  highlightSize: 200,
  highlightOpacity: 0.5,
  highlightHDRFactor: 1.2,
  highlightFollowSpeed: 0.15,

  // Thresholds
  restThreshold: 0.001,
  velocityThreshold: 0.001,
};

/**
 * Context Menu preset configuration.
 *
 * Behavior:
 * - No hover response
 * - Slight or no scale on press
 * - Content stretches during drag
 * - Scaling center shifts with drag
 * - Partially returns to rest during idle while pressed
 * - Full return only on release
 */
export const CONTEXT_MENU_PRESET: InteractionConfig = {
  // Preset identifier
  preset: 'context-menu',

  // Scale configuration
  baseScale: 1.0,
  hoverScale: 1.0, // No hover scale
  activeScale: 1.01, // Very slight scale on press
  maxScale: 1.5, // Higher limit for area-preserving stretch

  // Translation configuration
  enableHoverFollow: false, // No hover following
  hoverFollowFactor: 0,
  hoverFollowMaxDistance: 0,
  translateFactor: 0.05, // Reduced from 0.08 for less sensitive drag
  maxTranslate: 200,
  maxTranslateY: 300,

  // Stretch configuration
  stretchFactor: 0.0005,
  stretchLimit: 0.5,
  preserveArea: true,

  // Absolute value mode
  useAbsoluteValues: true,

  // Origin shift configuration
  enableOriginShift: true,
  originShiftSensitivity: 0.6, // Reduced from 0.9 for less sensitive origin shift

  // Idle return configuration
  enableIdleReturn: true,
  idleReturnDelay: 500,
  idleReturnPartial: true, // Only partial return while pressed
  idleReturnRatio: 0.5, // Return halfway to rest
  keepScaleOnIdleReturn: true, // Keep scale during idle return

  // Spring configuration
  hoverSpring: SOFT_SPRING,
  activeSpring: SNAPPY_SPRING,
  releaseSpring: DEFAULT_SPRING,

  // Highlight configuration (enabled for context menus)
  showHighlight: true,
  highlightSize: 180,
  highlightOpacity: 0.4,
  highlightHDRFactor: 1.1,
  highlightFollowSpeed: 0.2,

  // Thresholds
  restThreshold: 0.001,
  velocityThreshold: 0.001,
};

/**
 * Slider preset configuration.
 *
 * Behavior:
 * - Enlarges significantly on press with transparency
 * - Horizontal drag: compress vertically, stretch horizontally
 * - Vertical drag: compress horizontally, stretch vertically
 * - Elastic bounce effect (jelly-like)
 * - Center point remains fixed (no origin shift)
 * - No highlight by default
 */
export const SLIDER_PRESET: InteractionConfig = {
  // Preset identifier
  preset: 'slider',

  // Scale configuration
  baseScale: 1.0,
  hoverScale: 1.0, // No hover scale
  activeScale: 1.15, // Significant scale on press
  maxScale: 1.8, // Higher limit for area-preserving stretch

  // Translation configuration
  enableHoverFollow: false,
  hoverFollowFactor: 0,
  hoverFollowMaxDistance: 0,
  translateFactor: 0, // No translation, only stretch
  maxTranslate: 0,

  // Stretch configuration
  stretchFactor: 0.003,
  stretchLimit: 0.8,
  preserveArea: true,
  velocityStretch: true, // Use velocity for stretch (Material movement affects scale)
  velocityStretchFactor: 0.025,
  ignorePointerPosition: true, // Slider only responds to Material movement, not mouse position

  // Absolute value mode
  useAbsoluteValues: true,

  // Origin shift configuration
  enableOriginShift: false, // Center stays fixed
  originShiftSensitivity: 0,

  // Idle return configuration
  enableIdleReturn: false, // No idle return, only release return
  idleReturnDelay: 0,
  idleReturnPartial: false,
  keepScaleOnIdleReturn: false, // N/A for slider

  // Spring configuration (extra bouncy for jelly effect)
  hoverSpring: SOFT_SPRING,
  activeSpring: BOUNCY_SPRING,
  releaseSpring: {
    stiffness: 180,
    damping: 8, // Low damping for jelly bounce
    mass: 1,
  },

  // Highlight configuration
  showHighlight: false, // No highlight for sliders
  highlightSize: 0,
  highlightOpacity: 0,
  highlightHDRFactor: 1,
  highlightFollowSpeed: 0,

  // Background configuration (transparent background when active)
  activeBackgroundColor: 'transparent',
  enableBackgroundTransition: true,

  // Thresholds
  restThreshold: 0.002,
  velocityThreshold: 0.002,
};

/**
 * Maps preset names to their configurations.
 */
export const PRESET_MAP: Record<InteractionPreset, InteractionConfig> = {
  button: BUTTON_PRESET,
  'context-menu': CONTEXT_MENU_PRESET,
  slider: SLIDER_PRESET,
  custom: BUTTON_PRESET, // Custom uses button as base
};

// =============================================================================
// Interaction Engine Class
// =============================================================================

/**
 * InteractionEngine manages the physics-based animations for liquid glass materials.
 *
 * It handles:
 * - Pointer event processing (down, move, up, leave)
 * - Spring physics simulation for smooth animations
 * - Scale, translation, stretch, and origin calculations
 * - Idle detection and partial return behavior
 * - Highlight position tracking
 *
 * @example
 * ```ts
 * const engine = new InteractionEngine('button');
 *
 * // In pointer event handlers:
 * engine.onPointerDown({ clientX, clientY, pointerId });
 * engine.onPointerMove({ clientX, clientY });
 * engine.onPointerUp();
 *
 * // In animation loop:
 * function animate(timestamp: number) {
 *   const transform = engine.step(timestamp);
 *   applyTransform(element, transform);
 *   if (!engine.isAtRest()) {
 *     requestAnimationFrame(animate);
 *   }
 * }
 * ```
 */
export class InteractionEngine {
  /** Current interaction configuration */
  private config: InteractionConfig;

  /** Current interaction state */
  private state: InteractionState;

  /** Element dimensions for calculations */
  private elementSize: { width: number; height: number } = { width: 0, height: 0 };

  /** Last update timestamp for delta time calculation */
  private lastTimestamp: number | null = null;

  /** Idle timer for idle return behavior */
  private idleTimer: number | null = null;

  /** Flag indicating if idle return is in progress */
  private isIdleReturning: boolean = false;

  /** Callback for transform updates */
  private onTransformUpdate?: (transform: InteractionTransform) => void;

  /** Callback for state changes */
  private onStateChange?: (state: 'idle' | 'hover' | 'active' | 'releasing') => void;

  /**
   * Creates a new InteractionEngine instance.
   *
   * @param presetOrConfig - Preset name or custom configuration (defaults to 'button')
   * @param customOverrides - Optional overrides applied on top of preset
   */
  constructor(
    presetOrConfig?: InteractionPreset | Partial<InteractionConfig>,
    customOverrides?: Partial<InteractionConfig>,
  ) {
    // Use 'button' as default preset if not provided
    const resolvedPreset = presetOrConfig ?? 'button';

    // Determine base configuration
    const baseConfig = typeof resolvedPreset === 'string'
      ? PRESET_MAP[resolvedPreset]
      : { ...BUTTON_PRESET, ...resolvedPreset };

    // Apply custom overrides
    this.config = customOverrides
      ? { ...baseConfig, ...customOverrides }
      : { ...baseConfig };

    // Initialize state
    this.state = this.createInitialState();
  }

  /**
   * Creates the initial interaction state.
   */
  private createInitialState(): InteractionState {
    return {
      // Pointer state
      isPointerDown: false,
      isHovering: false,
      pointerId: undefined,
      pointerOrigin: null,
      currentPointer: null,
      previousPointer: null,

      // Animation phase
      phase: 'idle',

      // Transform values (current)
      scaleX: this.config.baseScale,
      scaleY: this.config.baseScale,
      translateX: 0,
      translateY: 0,
      originX: 50,
      originY: 50,
      opacity: 1,

      // Transform targets
      targetScaleX: this.config.baseScale,
      targetScaleY: this.config.baseScale,
      targetTranslateX: 0,
      targetTranslateY: 0,
      targetOriginX: 50,
      targetOriginY: 50,
      targetOpacity: 1,

      // Velocities for spring physics
      velocityScaleX: 0,
      velocityScaleY: 0,
      velocityTranslateX: 0,
      velocityTranslateY: 0,
      velocityOriginX: 0,
      velocityOriginY: 0,
      velocityOpacity: 0,

      // Highlight state
      highlightX: 0.5,
      highlightY: 0.5,
      highlightVisible: false,
      highlightTargetX: 0.5,
      highlightTargetY: 0.5,

      // Velocity tracking for stretch calculations
      pointerVelocityX: 0,
      pointerVelocityY: 0,

      // Idle tracking
      lastMoveTime: 0,
      idleReturnTarget: null,

      // Background color state
      backgroundColor: null,
      targetBackgroundColor: null,
    };
  }

  // ===========================================================================
  // Configuration Methods
  // ===========================================================================

  /**
   * Updates the interaction configuration.
   *
   * @param config - Partial configuration to merge
   */
  setConfig(config: Partial<InteractionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): InteractionConfig {
    return { ...this.config };
  }

  /**
   * Sets the element dimensions for origin shift calculations.
   *
   * @param width - Element width in pixels
   * @param height - Element height in pixels
   */
  setElementSize(width: number, height: number): void {
    this.elementSize = { width, height };
  }

  /**
   * Sets the transform update callback.
   */
  setOnTransformUpdate(callback: (transform: InteractionTransform) => void): void {
    this.onTransformUpdate = callback;
  }

  /**
   * Sets the state change callback.
   */
  setOnStateChange(callback: (state: 'idle' | 'hover' | 'active' | 'releasing') => void): void {
    this.onStateChange = callback;
  }

  // ===========================================================================
  // Pointer Event Handlers
  // ===========================================================================

  /**
   * Handles pointer down events.
   *
   * @param data - Pointer event data
   */
  onPointerDown(data: PointerData): void {
    const {
      clientX, clientY, pointerId, normalizedX, normalizedY,
    } = data;

    this.state.isPointerDown = true;
    this.state.pointerId = pointerId;
    this.state.pointerOrigin = { x: clientX, y: clientY };
    this.state.currentPointer = { x: clientX, y: clientY };
    this.state.previousPointer = { x: clientX, y: clientY };
    this.state.phase = 'active';
    this.state.lastMoveTime = performance.now();

    // Reset idle return state
    this.isIdleReturning = false;
    this.clearIdleTimer();
    this.state.idleReturnTarget = null;

    // Update highlight
    if (this.config.showHighlight) {
      this.state.highlightVisible = true;
      this.state.highlightTargetX = normalizedX ?? 0.5;
      this.state.highlightTargetY = normalizedY ?? 0.5;
    }

    // Calculate initial targets for active state
    this.updateActiveTargets(0, 0);

    this.onStateChange?.('active');
  }

  /**
   * Handles pointer move events.
   *
   * @param data - Pointer event data
   */
  onPointerMove(data: PointerData): void {
    const {
      clientX, clientY, normalizedX, normalizedY, pointerType,
    } = data;
    const now = performance.now();

    // Store previous pointer for velocity calculation
    if (this.state.currentPointer) {
      this.state.previousPointer = { ...this.state.currentPointer };
    }
    this.state.currentPointer = { x: clientX, y: clientY };

    // Calculate pointer velocity
    if (this.state.previousPointer) {
      const timeDelta = Math.max(1, now - this.state.lastMoveTime);
      this.state.pointerVelocityX = ((clientX - this.state.previousPointer.x) / timeDelta) * 16;
      this.state.pointerVelocityY = ((clientY - this.state.previousPointer.y) / timeDelta) * 16;
    }

    this.state.lastMoveTime = now;

    // Update highlight position
    if (this.config.showHighlight && normalizedX !== undefined && normalizedY !== undefined) {
      this.state.highlightTargetX = normalizedX;
      this.state.highlightTargetY = normalizedY;
    }

    if (this.state.isPointerDown) {
      // Active state: calculate drag-based transforms
      const dx = this.state.pointerOrigin ? clientX - this.state.pointerOrigin.x : 0;
      const dy = this.state.pointerOrigin ? clientY - this.state.pointerOrigin.y : 0;

      this.updateActiveTargets(dx, dy);

      // Reset idle timer on movement
      this.resetIdleTimer();
      this.isIdleReturning = false;
    } else if (this.config.enableHoverFollow && pointerType === 'mouse') {
      // Hover state: follow mouse with lag
      this.state.isHovering = true;
      this.state.phase = 'hover';

      if (this.state.pointerOrigin) {
        const dx = clientX - this.state.pointerOrigin.x;
        const dy = clientY - this.state.pointerOrigin.y;
        this.updateHoverTargets(dx, dy);
      } else {
        // First hover, set origin
        this.state.pointerOrigin = { x: clientX, y: clientY };
      }

      // Show highlight on hover
      if (this.config.showHighlight) {
        this.state.highlightVisible = true;
      }

      // Reset idle timer on hover movement
      this.resetIdleTimer();

      this.onStateChange?.('hover');
    }
  }

  /**
   * Handles pointer up events.
   */
  onPointerUp(): void {
    if (!this.state.isPointerDown) return;

    this.state.isPointerDown = false;
    this.state.phase = 'releasing';
    this.state.highlightVisible = false;

    // Clear idle timer
    this.clearIdleTimer();
    this.isIdleReturning = false;
    this.state.idleReturnTarget = null;

    // Reset targets to base state
    this.resetTargets();

    this.onStateChange?.('releasing');
  }

  /**
   * Handles pointer leave events.
   */
  onPointerLeave(): void {
    this.state.isHovering = false;
    this.state.highlightVisible = false;

    if (!this.state.isPointerDown) {
      this.state.phase = 'releasing';
      this.state.pointerOrigin = null;
      this.resetTargets();
      this.onStateChange?.('releasing');
    }

    // Clear idle timer
    this.clearIdleTimer();
  }

  /**
   * Handles pointer enter events (for hover tracking).
   */
  onPointerEnter(data: PointerData): void {
    if (this.config.enableHoverFollow && data.pointerType === 'mouse') {
      this.state.isHovering = true;
      this.state.pointerOrigin = { x: data.clientX, y: data.clientY };

      if (this.config.showHighlight) {
        this.state.highlightVisible = true;
        this.state.highlightTargetX = data.normalizedX ?? 0.5;
        this.state.highlightTargetY = data.normalizedY ?? 0.5;
      }
    }
  }

  // ===========================================================================
  // Target Calculation Methods
  // ===========================================================================

  /**
   * Updates targets for hover state.
   */
  private updateHoverTargets(dx: number, dy: number): void {
    const { hoverScale, hoverFollowFactor, hoverFollowMaxDistance } = this.config;

    // Scale to hover scale
    this.state.targetScaleX = hoverScale;
    this.state.targetScaleY = hoverScale;

    // Translate with limited distance
    const clampedDx = Math.max(-hoverFollowMaxDistance, Math.min(hoverFollowMaxDistance, dx * hoverFollowFactor));
    const clampedDy = Math.max(-hoverFollowMaxDistance, Math.min(hoverFollowMaxDistance, dy * hoverFollowFactor));

    this.state.targetTranslateX = clampedDx;
    this.state.targetTranslateY = clampedDy;

    // No origin shift or stretch on hover
    this.state.targetOriginX = 50;
    this.state.targetOriginY = 50;
  }

  /**
   * Updates targets for active (pressed) state.
   *
   * Enhanced to:
   * 1. Use element dimensions for aspect-ratio-aware stretch calculation
   * 2. Apply separate translation limits for X and Y axes
   * 3. Reduce overall deformation intensity with softer curves
   */
  private updateActiveTargets(dx: number, dy: number): void {
    const {
      activeScale,
      maxScale,
      translateFactor,
      maxTranslate,
      maxTranslateY, // New: separate Y limit (optional)
      stretchFactor,
      stretchLimit,
      preserveArea,
      velocityStretch,
      velocityStretchFactor,
      enableOriginShift,
      originShiftSensitivity,
      activeOpacity,
      enableOpacityTransition,
      ignorePointerPosition,
      useAbsoluteValues, // When true, use absolute pixel values instead of percentage-based calculations
    } = this.config;

    // Get element dimensions for aspect-ratio-aware calculations
    const { width: elWidth, height: elHeight } = this.elementSize;
    const hasValidDimensions = elWidth > 0 && elHeight > 0;

    // When useAbsoluteValues is enabled, we use a reference size (100px) for normalization
    // This makes different sized elements feel similar in terms of deformation
    const referenceSize = 100; // Reference size in pixels for absolute value mode

    // Calculate base scale
    let scaleX = activeScale;
    let scaleY = activeScale;

    // Calculate stretch based on drag or velocity
    let stretchX = 0;
    let stretchY = 0;

    // Determine dimensions to use for stretch calculation
    // When useAbsoluteValues is enabled, use reference size for consistent feel
    const stretchWidth = useAbsoluteValues ? referenceSize : (hasValidDimensions ? elWidth : 1);
    const stretchHeight = useAbsoluteValues ? referenceSize : (hasValidDimensions ? elHeight : 1);

    if (velocityStretch || ignorePointerPosition) {
      // Velocity-based stretch (for slider mode or when ignoring pointer position)
      // This makes the stretch depend on Material movement speed, not mouse position
      const vx = this.state.pointerVelocityX;
      const vy = this.state.pointerVelocityY;
      const factor = velocityStretchFactor ?? stretchFactor * 50;
      // Pass element dimensions for aspect-ratio normalization
      const stretch = calculateStretch(
        vx, vy, factor, stretchLimit,
        stretchWidth,
        stretchHeight,
      );
      stretchX = stretch.stretchX;
      stretchY = stretch.stretchY;
    } else {
      // Position-based stretch with element dimension normalization
      const stretch = calculateStretch(
        dx, dy, stretchFactor, stretchLimit,
        stretchWidth,
        stretchHeight,
      );
      stretchX = stretch.stretchX;
      stretchY = stretch.stretchY;
    }

    // Apply stretch - iOS 26 style:
    // Horizontal movement: add to X scale, subtract from Y scale (stretch horizontally, compress vertically)
    // Vertical movement: add to Y scale, subtract from X scale (stretch vertically, compress horizontally)
    //
    // Reduce the cross-axis compression to make deformation less extreme
    const crossAxisRatio = 0.6; // Reduced from 1.0 to make deformation more subtle
    scaleX += stretchX; // Horizontal movement stretches horizontally
    scaleX -= stretchY * crossAxisRatio; // Vertical movement compresses horizontally (reduced)

    scaleY += stretchY; // Vertical movement stretches vertically
    scaleY -= stretchX * crossAxisRatio; // Horizontal movement compresses vertically (reduced)

    // Preserve area if configured (scale one axis down when other is up)
    if (preserveArea) {
      const area = scaleX * scaleY;
      const targetArea = activeScale * activeScale;
      if (area > targetArea) {
        const factor = Math.sqrt(targetArea / area);
        scaleX *= factor;
        scaleY *= factor;
      }
    }

    // Clamp scales
    scaleX = Math.max(0.5, Math.min(maxScale, scaleX));
    scaleY = Math.max(0.5, Math.min(maxScale, scaleY));

    this.state.targetScaleX = scaleX;
    this.state.targetScaleY = scaleY;

    // Calculate translation with separate X and Y limits
    // Use maxTranslateY if specified, otherwise fall back to maxTranslate
    // This allows for different limits in each direction (e.g., more vertical freedom)
    const effectiveMaxTranslateY = maxTranslateY ?? maxTranslate;

    // Apply a softer easing curve to translation to prevent rigid cutoff
    // Use an asymptotic approach instead of hard clamp for smoother feel
    const softClamp = (value: number, limit: number): number => {
      if (limit <= 0) return 0;
      // Use tanh-like soft clamping: approaches limit asymptotically
      // This makes the limit feel less rigid while still bounding the value
      const normalized = value / limit;
      const softened = Math.tanh(normalized * 0.8) * limit;
      return softened;
    };

    const rawDx = dx * translateFactor;
    const rawDy = dy * translateFactor;

    // Apply soft clamping for a less rigid feel
    const clampedDx = softClamp(rawDx, maxTranslate);
    const clampedDy = softClamp(rawDy, effectiveMaxTranslateY);

    this.state.targetTranslateX = clampedDx;
    this.state.targetTranslateY = clampedDy;

    // Calculate origin shift
    if (enableOriginShift && this.elementSize.width > 0 && this.elementSize.height > 0) {
      const origin = calculateOriginShift(
        dx,
        dy,
        this.elementSize.width,
        this.elementSize.height,
        originShiftSensitivity,
      );
      this.state.targetOriginX = origin.originX;
      this.state.targetOriginY = origin.originY;
    }

    // Update opacity if configured
    if (enableOpacityTransition && activeOpacity !== undefined) {
      this.state.targetOpacity = activeOpacity;
    }

    // Update background color if configured
    const { activeBackgroundColor, enableBackgroundTransition } = this.config;
    if (enableBackgroundTransition && activeBackgroundColor !== undefined) {
      this.state.targetBackgroundColor = activeBackgroundColor;
      this.state.backgroundColor = activeBackgroundColor;
    }
  }

  /**
   * Resets all targets to base state.
   */
  private resetTargets(): void {
    const { baseScale } = this.config;

    this.state.targetScaleX = baseScale;
    this.state.targetScaleY = baseScale;
    this.state.targetTranslateX = 0;
    this.state.targetTranslateY = 0;
    this.state.targetOriginX = 50;
    this.state.targetOriginY = 50;
    this.state.targetOpacity = 1;
    this.state.targetBackgroundColor = null;
    this.state.backgroundColor = null;
  }

  // ===========================================================================
  // Idle Return Logic
  // ===========================================================================

  /**
   * Clears the idle timer.
   */
  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Resets the idle timer, canceling any pending idle return.
   */
  private resetIdleTimer(): void {
    this.clearIdleTimer();

    if (!this.config.enableIdleReturn) return;

    this.idleTimer = window.setTimeout(() => {
      this.triggerIdleReturn();
    }, this.config.idleReturnDelay);
  }

  /**
   * Triggers the idle return behavior.
   *
   * When `keepScaleOnIdleReturn` is enabled (default for button preset):
   * - Only translation returns to center
   * - Scale stays at hover/active scale
   * - Scale only returns to base when pointer leaves the element
   */
  private triggerIdleReturn(): void {
    if (!this.config.enableIdleReturn) return;

    // If pointer is down and we don't support partial return, don't do anything
    // This prevents button's hover idle return from interfering with press state
    if (this.state.isPointerDown && !this.config.idleReturnPartial) {
      return;
    }

    this.isIdleReturning = true;

    if (this.state.isPointerDown && this.config.idleReturnPartial) {
      // Partial return while still pressed (context-menu behavior)
      const ratio = this.config.idleReturnRatio ?? 0.5;
      this.state.idleReturnTarget = {
        scaleX: this.config.activeScale + (this.state.targetScaleX - this.config.activeScale) * (1 - ratio),
        scaleY: this.config.activeScale + (this.state.targetScaleY - this.config.activeScale) * (1 - ratio),
        translateX: this.state.targetTranslateX * (1 - ratio),
        translateY: this.state.targetTranslateY * (1 - ratio),
        originX: 50 + (this.state.targetOriginX - 50) * (1 - ratio),
        originY: 50 + (this.state.targetOriginY - 50) * (1 - ratio),
      };

      // Update targets to idle return targets
      this.state.targetScaleX = this.state.idleReturnTarget.scaleX;
      this.state.targetScaleY = this.state.idleReturnTarget.scaleY;
      this.state.targetTranslateX = this.state.idleReturnTarget.translateX;
      this.state.targetTranslateY = this.state.idleReturnTarget.translateY;
      this.state.targetOriginX = this.state.idleReturnTarget.originX;
      this.state.targetOriginY = this.state.idleReturnTarget.originY;
    } else if (this.state.isHovering && this.config.keepScaleOnIdleReturn) {
      // Hover idle return with keepScaleOnIdleReturn enabled
      // Keep the scale but return translation to center
      // Scale only resets when pointer actually leaves
      this.state.targetTranslateX = 0;
      this.state.targetTranslateY = 0;
      this.state.targetOriginX = 50;
      this.state.targetOriginY = 50;
      // Keep current hover scale - don't reset to baseScale
      // Scale will be reset in onPointerLeave instead
    } else {
      // Full return (for hover state when not pressed and keepScaleOnIdleReturn is false)
      this.resetTargets();
    }
  }

  // ===========================================================================
  // Animation Step
  // ===========================================================================

  /**
   * Performs one animation step.
   * Should be called in a requestAnimationFrame loop.
   *
   * @param timestamp - Current timestamp from requestAnimationFrame
   * @returns Current transform state
   */
  step(timestamp: number): InteractionTransform {
    // Calculate delta time
    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestamp;
    }
    const deltaMs = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    // Cap delta time to prevent jumps after tab switches
    const deltaTime = Math.min(deltaMs / 1000, 0.05);

    // Select spring configuration based on phase
    const spring = this.getActiveSpring();

    // Step each animated property
    this.stepProperty('scaleX', spring, deltaTime);
    this.stepProperty('scaleY', spring, deltaTime);
    this.stepProperty('translateX', spring, deltaTime);
    this.stepProperty('translateY', spring, deltaTime);
    this.stepProperty('originX', spring, deltaTime);
    this.stepProperty('originY', spring, deltaTime);
    this.stepProperty('opacity', spring, deltaTime);

    // Step highlight with separate speed
    this.stepHighlight(deltaTime);

    // Check if animation is complete
    if (this.checkAtRest()) {
      this.state.phase = 'idle';
      this.onStateChange?.('idle');
    }

    // Build transform
    const transform = this.buildTransform();

    // Notify callback
    this.onTransformUpdate?.(transform);

    return transform;
  }

  /**
   * Gets the appropriate spring configuration for the current phase.
   */
  private getActiveSpring(): SpringConfig {
    switch (this.state.phase) {
      case 'hover':
        return this.config.hoverSpring;
      case 'active':
        return this.config.activeSpring;
      case 'releasing':
        return this.config.releaseSpring;
      default:
        return this.config.releaseSpring;
    }
  }

  /**
   * Steps a single animated property using spring physics.
   */
  private stepProperty(
    property: 'scaleX' | 'scaleY' | 'translateX' | 'translateY' | 'originX' | 'originY' | 'opacity',
    spring: SpringConfig,
    deltaTime: number,
  ): void {
    const targetKey = `target${property.charAt(0).toUpperCase()}${property.slice(1)}` as keyof InteractionState;
    const velocityKey = `velocity${property.charAt(0).toUpperCase()}${property.slice(1)}` as keyof InteractionState;

    const current = this.state[property] as number;
    const target = this.state[targetKey] as number;
    const velocity = this.state[velocityKey] as number;

    const result = springStep(current, target, velocity, spring, deltaTime);

    (this.state as unknown as Record<string, number>)[property] = result.value;
    (this.state as unknown as Record<string, number>)[velocityKey] = result.velocity;
  }

  /**
   * Steps the highlight position with smooth follow.
   */
  private stepHighlight(deltaTime: number): void {
    const speed = this.config.highlightFollowSpeed;
    const factor = 1 - (1 - speed) ** (deltaTime * 60);

    this.state.highlightX += (this.state.highlightTargetX - this.state.highlightX) * factor;
    this.state.highlightY += (this.state.highlightTargetY - this.state.highlightY) * factor;
  }

  /**
   * Checks if all animated properties are at rest.
   */
  private checkAtRest(): boolean {
    if (this.state.isPointerDown || this.state.isHovering) {
      return false;
    }

    const { restThreshold, velocityThreshold } = this.config;

    return (
      isSpringAtRest(this.state.scaleX, this.state.targetScaleX, this.state.velocityScaleX, restThreshold, velocityThreshold)
      && isSpringAtRest(this.state.scaleY, this.state.targetScaleY, this.state.velocityScaleY, restThreshold, velocityThreshold)
      && isSpringAtRest(this.state.translateX, this.state.targetTranslateX, this.state.velocityTranslateX, restThreshold * 10, velocityThreshold * 10)
      && isSpringAtRest(this.state.translateY, this.state.targetTranslateY, this.state.velocityTranslateY, restThreshold * 10, velocityThreshold * 10)
      && isSpringAtRest(this.state.originX, this.state.targetOriginX, this.state.velocityOriginX, restThreshold * 100, velocityThreshold * 100)
      && isSpringAtRest(this.state.originY, this.state.targetOriginY, this.state.velocityOriginY, restThreshold * 100, velocityThreshold * 100)
    );
  }

  /**
   * Builds the current transform object.
   */
  private buildTransform(): InteractionTransform {
    return {
      scaleX: this.state.scaleX,
      scaleY: this.state.scaleY,
      translateX: this.state.translateX,
      translateY: this.state.translateY,
      originX: this.state.originX,
      originY: this.state.originY,
      opacity: this.state.opacity,
      backgroundColor: this.state.backgroundColor,
      highlightX: this.state.highlightX,
      highlightY: this.state.highlightY,
      highlightVisible: this.state.highlightVisible,
    };
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Checks if the engine is currently at rest (no active animation).
   */
  isAtRest(): boolean {
    return this.state.phase === 'idle' && this.checkAtRest();
  }

  /**
   * Gets the current interaction phase.
   */
  getPhase(): InteractionState['phase'] {
    return this.state.phase;
  }

  /**
   * Gets the current state snapshot.
   */
  getState(): InteractionState {
    return { ...this.state };
  }

  /**
   * Resets the engine to initial state.
   */
  reset(): void {
    this.clearIdleTimer();
    this.state = this.createInitialState();
    this.lastTimestamp = null;
    this.isIdleReturning = false;
  }

  /**
   * Resets the timestamp for animation (call when animation restarts).
   */
  resetTimestamp(): void {
    this.lastTimestamp = null;
  }

  /**
   * Cleanup method to be called on unmount.
   */
  destroy(): void {
    this.clearIdleTimer();
    this.onTransformUpdate = undefined;
    this.onStateChange = undefined;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Creates an InteractionEngine with the button preset.
 *
 * @param overrides - Optional configuration overrides
 * @returns Configured InteractionEngine
 */
export function createButtonEngine(overrides?: Partial<InteractionConfig>): InteractionEngine {
  return new InteractionEngine('button', overrides);
}

/**
 * Creates an InteractionEngine with the context-menu preset.
 *
 * @param overrides - Optional configuration overrides
 * @returns Configured InteractionEngine
 */
export function createContextMenuEngine(overrides?: Partial<InteractionConfig>): InteractionEngine {
  return new InteractionEngine('context-menu', overrides);
}

/**
 * Creates an InteractionEngine with the slider preset.
 *
 * @param overrides - Optional configuration overrides
 * @returns Configured InteractionEngine
 */
export function createSliderEngine(overrides?: Partial<InteractionConfig>): InteractionEngine {
  return new InteractionEngine('slider', overrides);
}

/**
 * Creates an InteractionEngine with custom configuration.
 *
 * @param config - Full custom configuration
 * @returns Configured InteractionEngine
 */
export function createCustomEngine(config: Partial<InteractionConfig>): InteractionEngine {
  return new InteractionEngine(config);
}
