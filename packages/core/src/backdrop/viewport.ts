import type { RectLike, Size } from '../types/common';
import type { ViewportCaptureConfig, ViewportCaptureRect } from '../types/context';

const DEFAULT_BUFFER_Y = 200;

function normalizeBuffer(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

/** Return the geometric intersection of two client-coordinate rectangles. */
export function intersectRects(
  left: RectLike,
  right: RectLike,
  clipX = true,
  clipY = true,
): RectLike {
  const x = clipX ? Math.max(left.x, right.x) : left.x;
  const y = clipY ? Math.max(left.y, right.y) : left.y;
  const rightEdge = clipX
    ? Math.min(left.x + left.width, right.x + right.width)
    : left.x + left.width;
  const bottomEdge = clipY
    ? Math.min(left.y + left.height, right.y + right.height)
    : left.y + left.height;
  return {
    x,
    y,
    width: Math.max(0, rightEdge - x),
    height: Math.max(0, bottomEdge - y),
  };
}

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
 * @param viewportScale - Scale from source layout pixels to viewport pixels.
 * @returns A clamped source-local region, or `null` when fully outside view.
 */
export function calculateViewportCaptureRect(
  elementRect: RectLike,
  fullSize: Size,
  viewportRect: RectLike,
  policy: boolean | ViewportCaptureConfig,
  viewportScale: { x: number; y: number } = { x: 1, y: 1 },
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
  const bufferX = normalizeBuffer(config.bufferX, 0);
  const bufferY = normalizeBuffer(config.bufferY, DEFAULT_BUFFER_Y);
  const left = Math.max(0, (visibleLeft - elementRect.x) / viewportScale.x - bufferX);
  const top = Math.max(0, (visibleTop - elementRect.y) / viewportScale.y - bufferY);
  const right = Math.min(fullSize.width, (visibleRight - elementRect.x) / viewportScale.x + bufferX);
  const bottom = Math.min(fullSize.height, (visibleBottom - elementRect.y) / viewportScale.y + bufferY);

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * Decide whether visible content has consumed half of its cached safety buffer.
 */
export function shouldRecaptureViewport(
  elementRect: RectLike,
  fullSize: Size,
  viewportRect: RectLike,
  policy: boolean | ViewportCaptureConfig,
  capturedRect: ViewportCaptureRect | null,
  viewportScale: { x: number; y: number } = { x: 1, y: 1 },
): boolean {
  if (!isEnabled(policy)) {
    return false;
  }
  const visibleRect = calculateViewportCaptureRect(
    elementRect,
    fullSize,
    viewportRect,
    { enabled: true, bufferX: 0, bufferY: 0 },
    viewportScale,
  );
  if (!visibleRect) {
    return false;
  }
  if (!capturedRect) {
    return true;
  }

  const config = typeof policy === 'boolean' ? {} : policy;
  const thresholdX = normalizeBuffer(config.bufferX, 0) / 2;
  const thresholdY = normalizeBuffer(config.bufferY, DEFAULT_BUFFER_Y) / 2;
  const capturedRight = capturedRect.x + capturedRect.width;
  const capturedBottom = capturedRect.y + capturedRect.height;
  const visibleRight = visibleRect.x + visibleRect.width;
  const visibleBottom = visibleRect.y + visibleRect.height;
  return (capturedRect.x > 0 && visibleRect.x - capturedRect.x < thresholdX)
    || (
      capturedRight < fullSize.width
      && capturedRight - visibleRight < thresholdX
    )
    || (capturedRect.y > 0 && visibleRect.y - capturedRect.y < thresholdY)
    || (
      capturedBottom < fullSize.height
      && capturedBottom - visibleBottom < thresholdY
    );
}
