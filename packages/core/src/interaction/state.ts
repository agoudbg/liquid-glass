import type { InteractionConfig } from '../types/interaction';
import { isSpringAtRest } from './spring';
import type {
  InteractionEngineState,
  InteractionTransform,
} from './types';

/**
 * Creates the reference implementation's initial interaction state.
 *
 * @param config - Resolved interaction configuration.
 * @returns A fresh mutable engine state.
 */
export function createInitialInteractionState(
  config: InteractionConfig,
): InteractionEngineState {
  return {
    isPointerDown: false,
    isHovering: false,
    pointerId: undefined,
    pointerOrigin: null,
    currentPointer: null,
    previousPointer: null,
    phase: 'idle',
    scaleX: config.baseScale,
    scaleY: config.baseScale,
    translateX: 0,
    translateY: 0,
    originX: 50,
    originY: 50,
    opacity: 1,
    targetScaleX: config.baseScale,
    targetScaleY: config.baseScale,
    targetTranslateX: 0,
    targetTranslateY: 0,
    targetOriginX: 50,
    targetOriginY: 50,
    targetOpacity: 1,
    velocityScaleX: 0,
    velocityScaleY: 0,
    velocityTranslateX: 0,
    velocityTranslateY: 0,
    velocityOriginX: 0,
    velocityOriginY: 0,
    velocityOpacity: 0,
    highlightX: 0.5,
    highlightY: 0.5,
    highlightVisible: false,
    highlightTargetX: 0.5,
    highlightTargetY: 0.5,
    pointerVelocityX: 0,
    pointerVelocityY: 0,
    lastMoveTime: 0,
    idleReturnTarget: null,
    backgroundColor: null,
    targetBackgroundColor: null,
  };
}

/**
 * Resets mutable transform targets to the configured base presentation.
 *
 * @param state - State to mutate.
 * @param config - Resolved interaction configuration.
 */
export function resetInteractionTargets(
  state: InteractionEngineState,
  config: InteractionConfig,
): void {
  state.targetScaleX = config.baseScale;
  state.targetScaleY = config.baseScale;
  state.targetTranslateX = 0;
  state.targetTranslateY = 0;
  state.targetOriginX = 50;
  state.targetOriginY = 50;
  state.targetOpacity = 1;
  state.targetBackgroundColor = null;
  state.backgroundColor = null;
}

/**
 * Builds the legacy transform payload from mutable engine state.
 *
 * @param state - Current engine state.
 * @returns Public transform snapshot.
 */
export function buildInteractionTransform(
  state: InteractionEngineState,
): InteractionTransform {
  return {
    scaleX: state.scaleX,
    scaleY: state.scaleY,
    translateX: state.translateX,
    translateY: state.translateY,
    originX: state.originX,
    originY: state.originY,
    opacity: state.opacity,
    backgroundColor: state.backgroundColor,
    highlightX: state.highlightX,
    highlightY: state.highlightY,
    highlightVisible: state.highlightVisible,
    isActive: state.isPointerDown,
  };
}

/**
 * Tests every animated transform axis against the configured rest tolerances.
 *
 * @param state - Current engine state.
 * @param config - Resolved interaction configuration.
 * @returns `true` only when no pointer is present and every spring has settled.
 */
export function isInteractionAtRest(
  state: InteractionEngineState,
  config: InteractionConfig,
): boolean {
  if (state.isPointerDown || state.isHovering) {
    return false;
  }

  return isInteractionMotionAtRest(state, config);
}

/**
 * Tests animated values without requiring the pointer phase to be idle.
 *
 * @param state - Current engine state.
 * @param config - Resolved interaction configuration.
 * @returns `true` when a shared scheduler may sleep until the next input.
 */
export function isInteractionMotionAtRest(
  state: InteractionEngineState,
  config: InteractionConfig,
): boolean {

  const { restThreshold, velocityThreshold } = config;
  const springsAtRest = isSpringAtRest(
    state.scaleX,
    state.targetScaleX,
    state.velocityScaleX,
    restThreshold,
    velocityThreshold,
  ) && isSpringAtRest(
    state.scaleY,
    state.targetScaleY,
    state.velocityScaleY,
    restThreshold,
    velocityThreshold,
  ) && isSpringAtRest(
    state.translateX,
    state.targetTranslateX,
    state.velocityTranslateX,
    restThreshold * 10,
    velocityThreshold * 10,
  ) && isSpringAtRest(
    state.translateY,
    state.targetTranslateY,
    state.velocityTranslateY,
    restThreshold * 10,
    velocityThreshold * 10,
  ) && isSpringAtRest(
    state.originX,
    state.targetOriginX,
    state.velocityOriginX,
    restThreshold * 100,
    velocityThreshold * 100,
  ) && isSpringAtRest(
    state.originY,
    state.targetOriginY,
    state.velocityOriginY,
    restThreshold * 100,
    velocityThreshold * 100,
  ) && isSpringAtRest(
    state.opacity,
    state.targetOpacity,
    state.velocityOpacity,
    restThreshold,
    velocityThreshold,
  );
  const highlightAtRest = !config.showHighlight
    || !state.highlightVisible
    || config.highlightFollowSpeed <= 0
    || (
      Math.abs(state.highlightX - state.highlightTargetX) <= restThreshold
      && Math.abs(state.highlightY - state.highlightTargetY) <= restThreshold
    );
  return springsAtRest && highlightAtRest;
}
