/** Axis-aligned CSS scale from container-local pixels into viewport pixels. */
export interface ContextViewportScale {
  /** Effective horizontal scale, including transformed ancestors. */
  readonly x: number;
  /** Effective vertical scale, including transformed ancestors. */
  readonly y: number;
}

function resolveScale(viewportDimension: number, layoutDimension: number): number {
  const scale = viewportDimension / layoutDimension;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * Measure viewport scale against the untransformed border box.
 *
 * Canvas CSS sizing and scroll offsets remain in layout pixels. Comparing the
 * same border box before and after CSS transforms also accounts for ancestor
 * scaling without treating borders as an additional transform.
 */
export function resolveContextViewportScale(
  container: HTMLElement,
  rect: DOMRectReadOnly,
): ContextViewportScale {
  return {
    x: resolveScale(rect.width, container.offsetWidth),
    y: resolveScale(rect.height, container.offsetHeight),
  };
}
