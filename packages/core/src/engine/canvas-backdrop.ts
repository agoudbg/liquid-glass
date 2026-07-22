import { GlassError } from '../errors/GlassError';
import type { CanvasBackdropRegistration } from './registrations';

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
  source.canvas.width = Math.max(1, Math.round(width * scale));
  source.canvas.height = Math.max(1, Math.round(height * scale));
  const sourceContext = require2DContext(
    source.canvas,
    'Unable to allocate a custom-backdrop drawing context.',
    source.id,
  );

  sourceContext.setTransform(1, 0, 0, 1, 0, 0);
  sourceContext.clearRect(0, 0, source.canvas.width, source.canvas.height);
  sourceContext.setTransform(scale, 0, 0, scale, 0, 0);
  try {
    source.config.draw(sourceContext, width, height);
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
 * Draw each custom source once, then mirror the same bitmap to both consumers.
 *
 * @param compositeCanvas - Core-owned backdrop texture canvas.
 * @param presentationWidth - Composite width in physical pixels.
 * @param presentationHeight - Composite height in physical pixels.
 * @param sources - Current custom backdrop registrations.
 * @param containerRect - Owning context bounds in CSS pixels.
 * @param deviceScale - Effective DPR multiplied by render precision.
 * @returns Metadata for capture events in source stacking order.
 */
export function drawCanvasBackdropComposite(
  compositeCanvas: HTMLCanvasElement,
  presentationWidth: number,
  presentationHeight: number,
  sources: Iterable<CanvasBackdropRegistration>,
  containerRect: DOMRectReadOnly,
  deviceScale: number,
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
    const configuredScale = source.config.scale ?? 1;
    const sourceScale = Number.isFinite(configuredScale) && configuredScale > 0
      ? configuredScale
      : 1;
    drawAuthoritativeSource(
      source,
      sourceRect.width,
      sourceRect.height,
      deviceScale * sourceScale,
    );
    mirrorToVisibleCanvas(source);

    compositeContext.drawImage(
      source.canvas,
      (sourceRect.left - containerRect.left) * deviceScale,
      (sourceRect.top - containerRect.top) * deviceScale,
      sourceRect.width * deviceScale,
      sourceRect.height * deviceScale,
    );
    captures.push({
      id: source.id,
      canvas: source.canvas,
      width: source.canvas.width,
      height: source.canvas.height,
    });
  }

  return captures;
}
