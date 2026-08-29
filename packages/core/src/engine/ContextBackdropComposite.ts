import { drawBackdropComposite } from './canvas-backdrop';
import type { BackdropRegistration } from './registrations';
import { isCanvasBackdropRegistration } from './registrations';

/** Metadata emitted after one custom source is redrawn and mirrored. */
export interface ContextBackdropCapture {
  /** Stable source identifier. */
  id: string;
  /** Core-owned authoritative source bitmap. */
  canvas: HTMLCanvasElement;
  /** Authoritative bitmap width. */
  width: number;
  /** Authoritative bitmap height. */
  height: number;
}

/** Bind context-owned canvases and capture events around backdrop composition. */
export class ContextBackdropComposite {
  /** Create one reusable composition facade for a glass context. */
  public constructor(
    private readonly compositeCanvas: HTMLCanvasElement,
    private readonly presentationCanvas: HTMLCanvasElement,
    private readonly sources: Map<string, BackdropRegistration>,
    private readonly onCaptured: (capture: ContextBackdropCapture) => void,
  ) {}

  /** Draw current source bitmaps in stacking order for the given container. */
  public draw(
    containerRect: DOMRectReadOnly,
    deviceScale: number,
    contentOffset: { x: number; y: number } = { x: 0, y: 0 },
  ): boolean {
    const captures = drawBackdropComposite(
      this.compositeCanvas,
      this.presentationCanvas.width,
      this.presentationCanvas.height,
      this.sources.values(),
      containerRect,
      deviceScale,
      contentOffset,
    );
    for (const capture of captures) {
      this.onCaptured(capture);
    }
    return ![...this.sources.values()].some((source) => (
      isCanvasBackdropRegistration(source) && source.dirty
    ));
  }
}
