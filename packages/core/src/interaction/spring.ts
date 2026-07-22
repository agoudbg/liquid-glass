import type { SpringConfig } from '../types/interaction';

/** Value and velocity returned by one spring integration step. */
export interface SpringStepResult {
  /** Integrated scalar value. */
  value: number;
  /** Integrated scalar velocity. */
  velocity: number;
}

/**
 * Advances a scalar spring using the legacy semi-implicit Euler integrator.
 *
 * @param current - Current scalar position.
 * @param target - Target scalar position.
 * @param velocity - Current scalar velocity.
 * @param config - Spring stiffness, damping, and mass.
 * @param deltaTime - Elapsed time in seconds.
 * @returns The integrated value and velocity.
 */
export function springStep(
  current: number,
  target: number,
  velocity: number,
  config: SpringConfig,
  deltaTime: number,
): SpringStepResult {
  const { stiffness, damping, mass } = config;
  const displacement = current - target;
  const springForce = -stiffness * displacement;
  const dampingForce = -damping * velocity;
  const acceleration = (springForce + dampingForce) / mass;
  const nextVelocity = velocity + acceleration * deltaTime;
  const nextValue = current + nextVelocity * deltaTime;

  return { value: nextValue, velocity: nextVelocity };
}

/**
 * Determines whether a scalar spring is within its position and velocity tolerances.
 *
 * @param current - Current scalar position.
 * @param target - Target scalar position.
 * @param velocity - Current scalar velocity.
 * @param threshold - Maximum position difference.
 * @param velocityThreshold - Maximum absolute velocity.
 * @returns `true` when both tolerances are satisfied.
 */
export function isSpringAtRest(
  current: number,
  target: number,
  velocity: number,
  threshold: number = 0.001,
  velocityThreshold: number = 0.001,
): boolean {
  return Math.abs(current - target) < threshold
    && Math.abs(velocity) < velocityThreshold;
}
