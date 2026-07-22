/** Transform-origin percentages calculated for a drag displacement. */
export interface OriginShiftResult {
  /** Horizontal transform origin percentage. */
  originX: number;
  /** Vertical transform origin percentage. */
  originY: number;
}

/**
 * Moves the transform origin opposite a drag, matching the legacy pull effect.
 *
 * @param dx - Horizontal drag displacement.
 * @param dy - Vertical drag displacement.
 * @param elementWidth - Material width in pixels.
 * @param elementHeight - Material height in pixels.
 * @param sensitivity - Origin response multiplier.
 * @returns Clamped transform-origin percentages.
 */
export function calculateOriginShift(
  dx: number,
  dy: number,
  elementWidth: number,
  elementHeight: number,
  sensitivity: number,
): OriginShiftResult {
  const shiftX = -(dx / elementWidth) * sensitivity * 100;
  const shiftY = -(dy / elementHeight) * sensitivity * 100;
  const originX = Math.max(-100, Math.min(200, 50 + shiftX));
  const originY = Math.max(-100, Math.min(200, 50 + shiftY));

  return { originX, originY };
}
