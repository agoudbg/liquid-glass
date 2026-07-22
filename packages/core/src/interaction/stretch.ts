/** Stretch amounts calculated independently for each axis. */
export interface StretchResult {
  /** Additive horizontal stretch. */
  stretchX: number;
  /** Additive vertical stretch. */
  stretchY: number;
}

/**
 * Converts displacement into the reference implementation's axis stretch values.
 *
 * @param dx - Horizontal displacement.
 * @param dy - Vertical displacement.
 * @param factor - Stretch sensitivity.
 * @param limit - Maximum additive stretch per axis.
 * @param elementWidth - Width used to normalize horizontal displacement.
 * @param elementHeight - Height used to normalize vertical displacement.
 * @returns Independent non-negative stretch values for both axes.
 */
export function calculateStretch(
  dx: number,
  dy: number,
  factor: number,
  limit: number,
  elementWidth: number = 1,
  elementHeight: number = 1,
): StretchResult {
  const normalizedDx = elementWidth > 0 ? dx / elementWidth : dx;
  const normalizedDy = elementHeight > 0 ? dy / elementHeight : dy;
  const stretchX = Math.min(limit, Math.abs(normalizedDx) * factor * 100);
  const stretchY = Math.min(limit, Math.abs(normalizedDy) * factor * 100);

  return { stretchX, stretchY };
}
