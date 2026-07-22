import type { RectLike, Size } from '../types/common';
import type { ViewportCaptureConfig, ViewportCaptureRect } from '../types/context';

const DEFAULT_BUFFER_Y = 200;

function isEnabled(policy: boolean | ViewportCaptureConfig): boolean {
  return typeof policy === 'boolean' ? policy : policy.enabled ?? true;
}

/**
 * Calculate the source-local rectangle that intersects a viewport plus buffers.
 *
 * @param elementRect - Source bounds in viewport coordinates.
 * @param fullSize - Complete source content size in CSS pixels.
 * @param viewportRect - Visible viewport bounds in the same coordinate space.
 * @param policy - Whether and how bounded capture is enabled.
 * @returns A clamped source-local region, or `null` when fully outside view.
 */
export function calculateViewportCaptureRect(
  elementRect: RectLike,
  fullSize: Size,
  viewportRect: RectLike,
  policy: boolean | ViewportCaptureConfig,
): ViewportCaptureRect | null {
  if (!isEnabled(policy)) {
    return { x: 0, y: 0, width: fullSize.width, height: fullSize.height };
  }

  const visibleLeft = Math.max(elementRect.x, viewportRect.x);
  const visibleTop = Math.max(elementRect.y, viewportRect.y);
  const visibleRight = Math.min(
    elementRect.x + elementRect.width,
    viewportRect.x + viewportRect.width,
  );
  const visibleBottom = Math.min(
    elementRect.y + elementRect.height,
    viewportRect.y + viewportRect.height,
  );
  if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) {
    return null;
  }

  const config = typeof policy === 'boolean' ? {} : policy;
  const bufferX = Math.max(0, config.bufferX ?? 0);
  const bufferY = Math.max(0, config.bufferY ?? DEFAULT_BUFFER_Y);
  const left = Math.max(0, visibleLeft - elementRect.x - bufferX);
  const top = Math.max(0, visibleTop - elementRect.y - bufferY);
  const right = Math.min(fullSize.width, visibleRight - elementRect.x + bufferX);
  const bottom = Math.min(fullSize.height, visibleBottom - elementRect.y + bufferY);

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
