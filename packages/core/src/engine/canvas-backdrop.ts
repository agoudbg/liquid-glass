import { GlassError } from '../errors/GlassError';
import type {
  BackdropRegistration,
  CanvasBackdropRegistration,
} from './registrations';
import {
  isCanvasBackdropRegistration,
  isDomBackdropRegistration,
} from './registrations';

/** Metadata emitted after one authoritative custom-canvas draw is mirrored. */
export interface CanvasBackdropCapture {
  /** Stable backdrop registration identifier. */
  id: string;
  /** Core-owned canvas containing the authoritative pixels. */
  canvas: HTMLCanvasElement;
  /** Authoritative bitmap width in physical pixels. */
  width: number;
  /** Authoritative bitmap height in physical pixels. */
  height: number;
}

function require2DContext(
  canvas: HTMLCanvasElement,
  message: string,
  backdropId?: string,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new GlassError(
      'CAPTURE_FAILED',
      message,
      { phase: 'capture', backdropId },
    );
  }
  return context;
}

function drawAuthoritativeSource(
  source: CanvasBackdropRegistration,
  width: number,
  height: number,
  scale: number,
): void {
  const physicalWidth = Math.max(1, Math.round(width * scale));
  const physicalHeight = Math.max(1, Math.round(height * scale));
  source.canvas.width = physicalWidth;
  source.canvas.height = physicalHeight;
  const sourceContext = require2DContext(
    source.canvas,
    'Unable to allocate a custom-backdrop drawing context.',
    source.id,
  );

  sourceContext.setTransform(1, 0, 0, 1, 0, 0);
  sourceContext.clearRect(0, 0, physicalWidth, physicalHeight);
  try {
    source.config.draw(sourceContext, physicalWidth, physicalHeight);
  } finally {
    sourceContext.setTransform(1, 0, 0, 1, 0, 0);
  }
}

function mirrorToVisibleCanvas(source: CanvasBackdropRegistration): void {
  const visibleCanvas = source.config.element;
  visibleCanvas.width = source.canvas.width;
  visibleCanvas.height = source.canvas.height;
  const visibleContext = require2DContext(
    visibleCanvas,
    'Unable to allocate the visible custom-backdrop context.',
    source.id,
  );
  visibleContext.setTransform(1, 0, 0, 1, 0, 0);
  visibleContext.clearRect(0, 0, visibleCanvas.width, visibleCanvas.height);
  visibleContext.drawImage(source.canvas, 0, 0);
}

/**
 * Composite captured DOM and freshly drawn custom sources in stacking order.
 *
 * @param compositeCanvas - Core-owned backdrop texture canvas.
 * @param presentationWidth - Composite width in physical pixels.
 * @param presentationHeight - Composite height in physical pixels.
 * @param sources - Current backdrop registrations.
 * @param containerRect - Owning context bounds in CSS pixels.
 * @param deviceScale - Effective DPR multiplied by render precision.
 * @param contentOffset - Scroll offset into full-content presentation coordinates.
 * @returns Metadata for capture events in source stacking order.
 */
export function drawBackdropComposite(
  compositeCanvas: HTMLCanvasElement,
  presentationWidth: number,
  presentationHeight: number,
  sources: Iterable<BackdropRegistration>,
  containerRect: DOMRectReadOnly,
  deviceScale: number,
  contentOffset: { x: number; y: number } = { x: 0, y: 0 },
): CanvasBackdropCapture[] {
  compositeCanvas.width = presentationWidth;
  compositeCanvas.height = presentationHeight;
  const compositeContext = require2DContext(
    compositeCanvas,
    'Unable to allocate the custom-backdrop composite context.',
  );
  compositeContext.clearRect(0, 0, presentationWidth, presentationHeight);

  const captures: CanvasBackdropCapture[] = [];
  const orderedSources = [...sources].sort(
    (left, right) => (left.config.zIndex ?? 0) - (right.config.zIndex ?? 0),
  );

  for (const source of orderedSources) {
    const sourceRect = source.config.element.getBoundingClientRect();
    if (isCanvasBackdropRegistration(source)) {
      const configuredScale = source.config.scale ?? 1;
      const sourceScale = Number.isFinite(configuredScale) && configuredScale > 0
        ? configuredScale
        : 1;
      const effectiveScale = deviceScale * sourceScale;
      const expectedWidth = Math.max(1, Math.round(sourceRect.width * effectiveScale));
      const expectedHeight = Math.max(1, Math.round(sourceRect.height * effectiveScale));
      const needsDraw = source.dirty
        || source.canvas.width !== expectedWidth
        || source.canvas.height !== expectedHeight;
      if (needsDraw) {
        drawAuthoritativeSource(
          source,
          sourceRect.width,
          sourceRect.height,
          effectiveScale,
        );
        mirrorToVisibleCanvas(source);
        source.dirty = false;
        captures.push({
          id: source.id,
          canvas: source.canvas,
          width: source.canvas.width,
          height: source.canvas.height,
        });
      }

      compositeContext.drawImage(
        source.canvas,
        (
          sourceRect.left
          - containerRect.left
          + contentOffset.x
        ) * deviceScale,
        (
          sourceRect.top
          - containerRect.top
          + contentOffset.y
        ) * deviceScale,
        sourceRect.width * deviceScale,
        sourceRect.height * deviceScale,
      );
      continue;
    }

    if (
      !isDomBackdropRegistration(source)
      || !source.canvas
      || !source.viewportRect
    ) {
      continue;
    }
    compositeContext.drawImage(
      source.canvas,
      (
        sourceRect.left
        - containerRect.left
        + source.viewportRect.x
        + contentOffset.x
      ) * deviceScale,
      (
        sourceRect.top
        - containerRect.top
        + source.viewportRect.y
        + contentOffset.y
      ) * deviceScale,
      source.viewportRect.width * deviceScale,
      source.viewportRect.height * deviceScale,
    );
  }

  return captures;
}
