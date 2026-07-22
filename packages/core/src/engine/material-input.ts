import type { PointerData } from '../interaction/types';
import type { InteractionState } from '../types/interaction';
import { validateFiniteNumber } from '../utils/validation';

function normalizedCoordinate(
  supplied: number | undefined,
  client: number,
  start: number,
  size: number,
  field: string,
): number {
  if (supplied !== undefined) {
    return validateFiniteNumber(supplied, field, { minimum: 0, maximum: 1 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, (client - start) / size));
}

/** Validate and normalize adapter interaction input for the physics engine. */
export function normalizeMaterialPointerInput(state: InteractionState): PointerData {
  const { elementRect, pointerState } = state;
  const clientX = validateFiniteNumber(
    pointerState.clientX,
    'interaction.pointerState.clientX',
  );
  const clientY = validateFiniteNumber(
    pointerState.clientY,
    'interaction.pointerState.clientY',
  );
  const left = validateFiniteNumber(
    elementRect.left,
    'interaction.elementRect.left',
  );
  const top = validateFiniteNumber(
    elementRect.top,
    'interaction.elementRect.top',
  );
  const width = validateFiniteNumber(
    elementRect.width,
    'interaction.elementRect.width',
    { minimum: 0 },
  );
  const height = validateFiniteNumber(
    elementRect.height,
    'interaction.elementRect.height',
    { minimum: 0 },
  );
  if (pointerState.pointerId !== undefined) {
    validateFiniteNumber(pointerState.pointerId, 'interaction.pointerState.pointerId', {
      integer: true,
    });
  }
  return {
    clientX,
    clientY,
    pointerId: pointerState.pointerId,
    pointerType: pointerState.pointerType,
    normalizedX: normalizedCoordinate(
      pointerState.normalizedX,
      clientX,
      left,
      width,
      'interaction.pointerState.normalizedX',
    ),
    normalizedY: normalizedCoordinate(
      pointerState.normalizedY,
      clientY,
      top,
      height,
      'interaction.pointerState.normalizedY',
    ),
  };
}
