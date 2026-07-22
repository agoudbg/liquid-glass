import type { InteractionConfig } from '../types/interaction';
import { InteractionEngine } from './InteractionEngine';

/** Creates an interaction engine using the legacy button preset. */
export function createButtonEngine(
  overrides?: Partial<InteractionConfig>,
): InteractionEngine {
  return new InteractionEngine('button', overrides);
}

/** Creates an interaction engine using the legacy context-menu preset. */
export function createContextMenuEngine(
  overrides?: Partial<InteractionConfig>,
): InteractionEngine {
  return new InteractionEngine('context-menu', overrides);
}

/** Creates an interaction engine using the legacy slider preset. */
export function createSliderEngine(
  overrides?: Partial<InteractionConfig>,
): InteractionEngine {
  return new InteractionEngine('slider', overrides);
}

/**
 * Creates a button-based engine with a partial custom configuration.
 *
 * @param config - Custom values shallowly merged over the button preset.
 * @returns Configured interaction engine.
 */
export function createCustomEngine(
  config: Partial<InteractionConfig>,
): InteractionEngine {
  return new InteractionEngine(config);
}
