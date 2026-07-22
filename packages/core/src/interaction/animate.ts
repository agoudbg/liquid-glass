import type { InteractionConfig, SpringConfig } from '../types/interaction';
import { springStep } from './spring';
import type { InteractionEngineState } from './types';

function integrate(
  current: number,
  target: number,
  velocity: number,
  spring: SpringConfig,
  deltaTime: number,
): { value: number; velocity: number } {
  return springStep(current, target, velocity, spring, deltaTime);
}

/**
 * Advances every animated state property in legacy evaluation order.
 *
 * @param state - Mutable interaction state.
 * @param spring - Spring selected for the current interaction phase.
 * @param deltaTime - Elapsed animation time in seconds.
 */
export function stepInteractionSprings(
  state: InteractionEngineState,
  spring: SpringConfig,
  deltaTime: number,
): void {
  let result = integrate(
    state.scaleX,
    state.targetScaleX,
    state.velocityScaleX,
    spring,
    deltaTime,
  );
  state.scaleX = result.value;
  state.velocityScaleX = result.velocity;

  result = integrate(
    state.scaleY,
    state.targetScaleY,
    state.velocityScaleY,
    spring,
    deltaTime,
  );
  state.scaleY = result.value;
  state.velocityScaleY = result.velocity;

  result = integrate(
    state.translateX,
    state.targetTranslateX,
    state.velocityTranslateX,
    spring,
    deltaTime,
  );
  state.translateX = result.value;
  state.velocityTranslateX = result.velocity;

  result = integrate(
    state.translateY,
    state.targetTranslateY,
    state.velocityTranslateY,
    spring,
    deltaTime,
  );
  state.translateY = result.value;
  state.velocityTranslateY = result.velocity;

  result = integrate(
    state.originX,
    state.targetOriginX,
    state.velocityOriginX,
    spring,
    deltaTime,
  );
  state.originX = result.value;
  state.velocityOriginX = result.velocity;

  result = integrate(
    state.originY,
    state.targetOriginY,
    state.velocityOriginY,
    spring,
    deltaTime,
  );
  state.originY = result.value;
  state.velocityOriginY = result.velocity;

  result = integrate(
    state.opacity,
    state.targetOpacity,
    state.velocityOpacity,
    spring,
    deltaTime,
  );
  state.opacity = result.value;
  state.velocityOpacity = result.velocity;
}

/**
 * Advances the pointer highlight with the legacy frame-rate-adjusted lerp.
 *
 * @param state - Mutable interaction state.
 * @param config - Resolved interaction configuration.
 * @param deltaTime - Elapsed animation time in seconds.
 */
export function stepInteractionHighlight(
  state: InteractionEngineState,
  config: InteractionConfig,
  deltaTime: number,
): void {
  const factor = 1 - (1 - config.highlightFollowSpeed) ** (deltaTime * 60);
  state.highlightX += (state.highlightTargetX - state.highlightX) * factor;
  state.highlightY += (state.highlightTargetY - state.highlightY) * factor;
}
