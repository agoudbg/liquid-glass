import { GlassError } from '../errors/GlassError';
import type { GlassEngineRuntime } from './runtime';

/**
 * Own the internal WebGL, backdrop-composite, and visible presentation canvases.
 *
 * WebGL stays isolated from the DOM-facing canvas so presentation follows the
 * same WebGL-to-2D copy path as the reference implementation.
 */
export class ContextCanvasPipeline {
  /** Internal canvas that owns the WebGL2 context and its lifecycle listeners. */
  public readonly rendererCanvas: HTMLCanvasElement;
  /** Internal 2D canvas used to composite registered backdrop sources. */
  public readonly compositeCanvas: HTMLCanvasElement;
  /** Sole visible 2D canvas appended to the context container. */
  public readonly presentationCanvas: HTMLCanvasElement;

  private presentationContext: CanvasRenderingContext2D | null = null;
  private destroyed = false;

  /**
   * Create the three core-owned canvases in stable renderer/composite/presentation order.
   *
   * @param runtime - Browser canvas factory or deterministic test runtime.
   */
  public constructor(runtime: GlassEngineRuntime) {
    this.rendererCanvas = runtime.createCanvas();
    this.compositeCanvas = runtime.createCanvas();
    this.presentationCanvas = runtime.createCanvas();
  }

  /**
   * Match the visible canvas to the internal WebGL drawing buffer.
   *
   * @returns Whether either physical canvas dimension changed.
   */
  public resizePresentationToRenderer(): boolean {
    return this.resizePresentation(
      this.rendererCanvas.width,
      this.rendererCanvas.height,
    );
  }

  /**
   * Resize the visible canvas without resetting its bitmap unnecessarily.
   *
   * @param width - Physical width in device pixels.
   * @param height - Physical height in device pixels.
   * @returns Whether either physical canvas dimension changed.
   */
  public resizePresentation(width: number, height: number): boolean {
    const resized = this.presentationCanvas.width !== width
      || this.presentationCanvas.height !== height;
    if (this.presentationCanvas.width !== width) {
      this.presentationCanvas.width = width;
    }
    if (this.presentationCanvas.height !== height) {
      this.presentationCanvas.height = height;
    }
    return resized;
  }

  /**
   * Synchronously copy the complete WebGL drawing buffer into the visible canvas.
   */
  public presentRendererFrame(): void {
    this.resizePresentationToRenderer();
    const { width, height } = this.rendererCanvas;
    const context = this.getPresentationContext();
    context.clearRect(0, 0, width, height);
    context.drawImage(
      this.rendererCanvas,
      0,
      0,
      width,
      height,
    );
  }

  /** Idempotently release every core-owned canvas bitmap. */
  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    for (const canvas of [
      this.rendererCanvas,
      this.compositeCanvas,
      this.presentationCanvas,
    ]) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  private getPresentationContext(): CanvasRenderingContext2D {
    this.presentationContext ??= this.presentationCanvas.getContext('2d');
    if (!this.presentationContext) {
      throw new GlassError(
        'RENDER_FAILED',
        'Failed to acquire the liquid-glass presentation 2D context.',
        { phase: 'render' },
      );
    }
    return this.presentationContext;
  }
}
