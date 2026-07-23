import type { PlaygroundState } from './types';

/** Return whether the isolated S004 interaction-policy fixture may render. */
export function isInteractionPolicyFixture(state: PlaygroundState): boolean {
  return state.testMode
    && state.testFixture === 'interaction-policy'
    && state.scene === 'S004'
    && !state.oracleMode;
}

/**
 * Clear a fixture as soon as a state transition leaves its supported surface.
 *
 * Returning the original object for valid states keeps this helper suitable for
 * both the current shell merge and a future reducer-style transition pipeline.
 */
export function normalizeTestFixtureState(
  state: PlaygroundState,
): PlaygroundState {
  if (state.testFixture === null || isInteractionPolicyFixture(state)) {
    return state;
  }
  return { ...state, testFixture: null };
}
