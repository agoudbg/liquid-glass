import type {
  InteractionConfig,
  InteractionPreset,
  SpringConfig,
} from '../types/interaction';
import {
  stepInteractionHighlight,
  stepInteractionSprings,
} from './animate';
import { PRESET_MAP } from './presets';
import {
  buildInteractionTransform,
  createInitialInteractionState,
  isInteractionAtRest,
  resetInteractionTargets,
} from './state';
import { updateActiveTargets, updateHoverTargets } from './targets';
import type {
  InteractionElementSize,
  InteractionEngineState,
  InteractionPhase,
  InteractionPhaseCallback,
  InteractionTransform,
  PointerData,
  TransformUpdateCallback,
} from './types';

function mergeInteractionConfig(
  base: InteractionConfig,
  overrides: Partial<InteractionConfig>,
): InteractionConfig {
  return {
    ...base,
    ...overrides,
    hoverSpring: { ...(overrides.hoverSpring ?? base.hoverSpring) },
    activeSpring: { ...(overrides.activeSpring ?? base.activeSpring) },
    releaseSpring: { ...(overrides.releaseSpring ?? base.releaseSpring) },
  };
}

function cloneInteractionConfig(config: InteractionConfig): InteractionConfig {
  return mergeInteractionConfig(config, {});
}

/**
 * Drives pointer-responsive liquid-glass transforms with legacy spring physics.
 */
export class InteractionEngine {
  private config: InteractionConfig;
  private state: InteractionEngineState;
  private elementSize: InteractionElementSize = { width: 0, height: 0 };
  private lastTimestamp: number | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private onTransformUpdate?: TransformUpdateCallback;
  private onStateChange?: InteractionPhaseCallback;

  /**
   * Creates an interaction engine from a preset or button-based custom options.
   *
   * @param presetOrConfig - Preset name or partial custom configuration.
   * @param customOverrides - Overrides applied after resolving the preset.
   */
  constructor(
    presetOrConfig?: InteractionPreset | Partial<InteractionConfig>,
    customOverrides?: Partial<InteractionConfig>,
  ) {
    const resolvedPreset = presetOrConfig ?? 'button';
    const baseConfig = typeof resolvedPreset === 'string'
      ? PRESET_MAP[resolvedPreset]
      : mergeInteractionConfig(PRESET_MAP.button, resolvedPreset);
    this.config = mergeInteractionConfig(baseConfig, customOverrides ?? {});
    this.state = createInitialInteractionState(this.config);
  }

  /** Merges interaction options into the current resolved configuration. */
  setConfig(config: Partial<InteractionConfig>): void {
    this.config = mergeInteractionConfig(this.config, config);
  }

  /** Returns an isolated snapshot of the resolved interaction configuration. */
  getConfig(): InteractionConfig {
    return cloneInteractionConfig(this.config);
  }

  /**
   * Updates the material dimensions used by stretch and transform-origin math.
   *
   * @param width - Material width in CSS pixels.
   * @param height - Material height in CSS pixels.
   */
  setElementSize(width: number, height: number): void {
    this.elementSize = { width, height };
  }

  /** Registers a callback invoked after every animation step. */
  setOnTransformUpdate(callback: TransformUpdateCallback): void {
    this.onTransformUpdate = callback;
  }

  /** Registers a callback invoked for interaction phase transitions. */
  setOnStateChange(callback: InteractionPhaseCallback): void {
    this.onStateChange = callback;
  }

  /** Starts an active pointer gesture. */
  onPointerDown(data: PointerData): void {
    if (this.state.isPointerDown && !this.isOwnedPointer(data.pointerId)) {
      return;
    }
    const { clientX, clientY, pointerId, normalizedX, normalizedY } = data;
    this.state.isPointerDown = true;
    this.state.pointerId = pointerId;
    this.state.pointerOrigin = { x: clientX, y: clientY };
    this.state.currentPointer = { x: clientX, y: clientY };
    this.state.previousPointer = { x: clientX, y: clientY };
    this.state.phase = 'active';
    this.state.lastMoveTime = performance.now();
    this.clearIdleTimer();
    this.state.idleReturnTarget = null;

    if (this.config.showHighlight) {
      this.state.highlightVisible = true;
      this.state.highlightTargetX = normalizedX ?? 0.5;
      this.state.highlightTargetY = normalizedY ?? 0.5;
    }

    updateActiveTargets(this.state, this.config, this.elementSize, 0, 0);
    this.onStateChange?.('active');
  }

  /** Updates pointer velocity, highlight position, and transform targets. */
  onPointerMove(data: PointerData): void {
    if (this.state.isPointerDown && !this.isOwnedPointer(data.pointerId)) {
      return;
    }
    const { clientX, clientY, normalizedX, normalizedY, pointerType } = data;
    const now = performance.now();

    if (this.state.currentPointer) {
      this.state.previousPointer = { ...this.state.currentPointer };
    }
    this.state.currentPointer = { x: clientX, y: clientY };

    if (this.state.previousPointer) {
      const timeDelta = Math.max(1, now - this.state.lastMoveTime);
      this.state.pointerVelocityX = (
        (clientX - this.state.previousPointer.x) / timeDelta
      ) * 16;
      this.state.pointerVelocityY = (
        (clientY - this.state.previousPointer.y) / timeDelta
      ) * 16;
    }
    this.state.lastMoveTime = now;

    if (
      this.config.showHighlight
      && normalizedX !== undefined
      && normalizedY !== undefined
    ) {
      this.state.highlightTargetX = normalizedX;
      this.state.highlightTargetY = normalizedY;
    }

    if (this.state.isPointerDown) {
      const dx = this.state.pointerOrigin
        ? clientX - this.state.pointerOrigin.x
        : 0;
      const dy = this.state.pointerOrigin
        ? clientY - this.state.pointerOrigin.y
        : 0;
      updateActiveTargets(this.state, this.config, this.elementSize, dx, dy);
      this.resetIdleTimer();
    } else if (this.config.enableHoverFollow && pointerType === 'mouse') {
      this.state.isHovering = true;
      this.state.phase = 'hover';

      if (this.state.pointerOrigin) {
        updateHoverTargets(
          this.state,
          this.config,
          clientX - this.state.pointerOrigin.x,
          clientY - this.state.pointerOrigin.y,
        );
      } else {
        this.state.pointerOrigin = { x: clientX, y: clientY };
      }

      if (this.config.showHighlight) {
        this.state.highlightVisible = true;
      }
      this.resetIdleTimer();
      this.onStateChange?.('hover');
    }
  }

  /**
   * Ends an active pointer gesture and starts the release spring.
   *
   * @param pointerId - Optional owner identifier used to reject unrelated pointers.
   */
  onPointerUp(pointerId?: number): void {
    if (!this.state.isPointerDown || !this.isOwnedPointer(pointerId)) {
      return;
    }

    this.state.isPointerDown = false;
    this.state.pointerId = undefined;
    this.state.phase = 'releasing';
    this.state.highlightVisible = false;
    this.clearIdleTimer();
    this.state.idleReturnTarget = null;
    resetInteractionTargets(this.state, this.config);
    this.onStateChange?.('releasing');
  }

  /**
   * Clears hover feedback and releases the material when no press is active.
   *
   * @param pointerId - Optional owner identifier used to reject unrelated pointers.
   */
  onPointerLeave(pointerId?: number): void {
    if (this.state.isPointerDown && !this.isOwnedPointer(pointerId)) {
      return;
    }
    this.state.isHovering = false;
    this.state.highlightVisible = false;

    if (!this.state.isPointerDown) {
      this.state.pointerId = undefined;
      this.state.phase = 'releasing';
      this.state.pointerOrigin = null;
      resetInteractionTargets(this.state, this.config);
      this.onStateChange?.('releasing');
    }
    this.clearIdleTimer();
  }

  /** Initializes mouse-hover tracking without immediately changing phase. */
  onPointerEnter(data: PointerData): void {
    if (this.state.isPointerDown && !this.isOwnedPointer(data.pointerId)) {
      return;
    }
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

  /**
   * Advances every spring using a requestAnimationFrame timestamp.
   *
   * @param timestamp - Current animation timestamp in milliseconds.
   * @returns Current transform values after integration.
   */
  step(timestamp: number): InteractionTransform {
    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestamp;
    }
    const deltaMs = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    const deltaTime = Math.min(deltaMs / 1000, 0.05);
    const spring = this.getActiveSpring();

    stepInteractionSprings(this.state, spring, deltaTime);
    stepInteractionHighlight(this.state, this.config, deltaTime);

    if (
      this.state.phase !== 'idle'
      && isInteractionAtRest(this.state, this.config)
    ) {
      this.state.phase = 'idle';
      this.onStateChange?.('idle');
    }

    const transform = buildInteractionTransform(this.state);
    this.onTransformUpdate?.(transform);
    return transform;
  }

  /** Returns whether the engine is idle and every spring has settled. */
  isAtRest(): boolean {
    return this.state.phase === 'idle'
      && isInteractionAtRest(this.state, this.config);
  }

  /** Returns the current interaction phase. */
  getPhase(): InteractionPhase {
    return this.state.phase;
  }

  /** Returns a shallow snapshot of the engine's complete numeric state. */
  getState(): InteractionEngineState {
    return { ...this.state };
  }

  /** Restores initial state while retaining the resolved configuration. */
  reset(): void {
    this.clearIdleTimer();
    this.state = createInitialInteractionState(this.config);
    this.lastTimestamp = null;
  }

  /** Clears the animation clock before a newly scheduled frame sequence. */
  resetTimestamp(): void {
    this.lastTimestamp = null;
  }

  /** Releases timers and registered callbacks. */
  destroy(): void {
    this.clearIdleTimer();
    this.onTransformUpdate = undefined;
    this.onStateChange = undefined;
  }

  private getActiveSpring(): SpringConfig {
    switch (this.state.phase) {
      case 'hover':
        return this.config.hoverSpring;
      case 'active':
        return this.config.activeSpring;
      case 'releasing':
      case 'idle':
        return this.config.releaseSpring;
    }
  }

  private isOwnedPointer(pointerId: number | undefined): boolean {
    return this.state.pointerId === undefined
      || pointerId === undefined
      || this.state.pointerId === pointerId;
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    if (!this.config.enableIdleReturn) {
      return;
    }
    this.idleTimer = setTimeout(() => {
      this.triggerIdleReturn();
    }, this.config.idleReturnDelay);
  }

  private triggerIdleReturn(): void {
    if (!this.config.enableIdleReturn) {
      return;
    }
    if (this.state.isPointerDown && !this.config.idleReturnPartial) {
      return;
    }

    if (this.state.isPointerDown && this.config.idleReturnPartial) {
      const ratio = this.config.idleReturnRatio ?? 0.5;
      this.state.idleReturnTarget = {
        scaleX: this.config.activeScale
          + (this.state.targetScaleX - this.config.activeScale) * (1 - ratio),
        scaleY: this.config.activeScale
          + (this.state.targetScaleY - this.config.activeScale) * (1 - ratio),
        translateX: this.state.targetTranslateX * (1 - ratio),
        translateY: this.state.targetTranslateY * (1 - ratio),
        originX: 50 + (this.state.targetOriginX - 50) * (1 - ratio),
        originY: 50 + (this.state.targetOriginY - 50) * (1 - ratio),
      };
      Object.assign(this.state, {
        targetScaleX: this.state.idleReturnTarget.scaleX,
        targetScaleY: this.state.idleReturnTarget.scaleY,
        targetTranslateX: this.state.idleReturnTarget.translateX,
        targetTranslateY: this.state.idleReturnTarget.translateY,
        targetOriginX: this.state.idleReturnTarget.originX,
        targetOriginY: this.state.idleReturnTarget.originY,
      });
    } else if (this.state.isHovering && this.config.keepScaleOnIdleReturn) {
      this.state.targetTranslateX = 0;
      this.state.targetTranslateY = 0;
      this.state.targetOriginX = 50;
      this.state.targetOriginY = 50;
    } else {
      resetInteractionTargets(this.state, this.config);
    }
  }
}
