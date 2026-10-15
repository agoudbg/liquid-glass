/** Logical dimensions used to size one context presentation frame. */
export interface ContextLogicalSize {
  /** Logical height in CSS pixels. */
  readonly height: number;
  /** Logical width in CSS pixels. */
  readonly width: number;
}

/**
 * Resolve one logical dimension without applying an inherited CSS transform twice.
 *
 * @param clientDimension - Untransformed client-box dimension.
 * @param boundingDimension - Viewport-space bounding dimension.
 * @returns Finite logical dimension used by renderer sizing.
 */
export function resolveContextLogicalDimension(
  clientDimension: number,
  boundingDimension: number,
): number {
  return Number.isFinite(clientDimension)
    && clientDimension >= 0
    ? clientDimension
    : boundingDimension;
}

/**
 * Measure full scroll content while excluding the previous presentation bitmap.
 *
 * The visible canvas participates in overflow sizing. Hiding it during the read
 * lets content shrink after a previous larger frame without retaining stale size.
 *
 * @param content - Context content element that owns scrolling.
 * @param presentationCanvas - Visible canvas participating in content overflow.
 * @param fallbackWidth - Minimum width derived from the context viewport.
 * @param fallbackHeight - Minimum height derived from the context viewport.
 * @returns Full logical presentation size in CSS pixels.
 */
export function measureFullContentPresentation(
  content: HTMLElement,
  presentationCanvas: HTMLCanvasElement,
  fallbackWidth: number,
  fallbackHeight: number,
): ContextLogicalSize {
  const display = presentationCanvas.style.display;
  presentationCanvas.style.display = 'none';
  try {
    return {
      width: resolveContentDimension(
        content.scrollWidth,
        content.clientWidth,
        fallbackWidth,
      ),
      height: resolveContentDimension(
        content.scrollHeight,
        content.clientHeight,
        fallbackHeight,
      ),
    };
  } finally {
    presentationCanvas.style.display = display;
  }
}

function resolveContentDimension(
  scrollDimension: number,
  clientDimension: number,
  fallback: number,
): number {
  const resolvedScroll = Number.isFinite(scrollDimension)
    ? Math.max(0, scrollDimension)
    : 0;
  const resolvedClient = Number.isFinite(clientDimension)
    ? Math.max(0, clientDimension)
    : 0;
  return Math.max(resolvedScroll, resolvedClient, fallback);
}
