import type {
  MaterialPresentationState,
} from '../types/context';
import type {
  InteractionConfig,
  InteractionOutput,
} from '../types/interaction';

/** Clone a resolved interaction configuration without sharing spring objects. */
export function cloneInteractionConfig(
  config: InteractionConfig,
): InteractionConfig {
  return {
    ...config,
    hoverSpring: { ...config.hoverSpring },
    activeSpring: { ...config.activeSpring },
    releaseSpring: { ...config.releaseSpring },
  };
}

/** Clone a framework-facing presentation without exposing mutable internals. */
export function cloneMaterialPresentation(
  presentation: MaterialPresentationState,
): MaterialPresentationState {
  return {
    ...presentation,
    interactionConfig: cloneInteractionConfig(presentation.interactionConfig),
    interactionOutput: { ...presentation.interactionOutput },
  };
}

/** Compare interaction output fields without allocating serialized payloads. */
export function interactionOutputsEqual(
  left: InteractionOutput,
  right: InteractionOutput,
): boolean {
  return left.scaleX === right.scaleX
    && left.scaleY === right.scaleY
    && left.translateX === right.translateX
    && left.translateY === right.translateY
    && left.originX === right.originX
    && left.originY === right.originY
    && left.opacity === right.opacity
    && left.backgroundColor === right.backgroundColor
    && left.highlightX === right.highlightX
    && left.highlightY === right.highlightY
    && left.highlightVisible === right.highlightVisible
    && left.isActive === right.isActive;
}

/** Compare complete resolved configurations with their stable field ordering. */
export function interactionConfigsEqual(
  left: InteractionConfig,
  right: InteractionConfig,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
