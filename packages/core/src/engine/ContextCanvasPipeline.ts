import { GlassError } from '../errors/GlassError';
import { calculateMaterialScissor } from '../renderer/scissor';
import type { RendererMaterial } from '../renderer/types';
import type { GlassEngineRuntime } from './runtime';

/** Inputs used to compose one viewport-sized nested-context frame. */
export interface FullFrameComposition {
  /** Whether the backdrop canvas contains a current source composition. */
  readonly hasBackdrop: boolean;
  /** Horizontal source offset in physical pixels. */
  readonly sourceX: number;
  /** Vertical source offset in physical pixels. */
  readonly sourceY: number;
  /** Output width in physical pixels. */
  readonly width: number;
  /** Output height in physical pixels. */
  readonly height: number;
}

/**
 * Own the WebGL, backdrop, visible, and complete-composition canvases.
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
  /** Internal 2D canvas exposing a stable copy of the complete material set. */
  public readonly materialsCanvas: HTMLCanvasElement;
  /** Internal 2D canvas containing the current viewport backdrop and materials. */
  public readonly fullCompositeCanvas: HTMLCanvasElement;

  private presentationContext: CanvasRenderingContext2D | null = null;
  private materialsContext: CanvasRenderingContext2D | null = null;
  private fullCompositeContext: CanvasRenderingContext2D | null = null;
  private destroyed = false;

  /**
   * Create the five core-owned canvases in stable pipeline order.
   *
   * @param runtime - Browser canvas factory or deterministic test runtime.
   */
  public constructor(runtime: GlassEngineRuntime) {
    this.rendererCanvas = runtime.createCanvas();
    this.compositeCanvas = runtime.createCanvas();
    this.presentationCanvas = runtime.createCanvas();
    this.materialsCanvas = runtime.createCanvas();
    this.fullCompositeCanvas = runtime.createCanvas();
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

  /**
   * Remove one dedicated material region from the shared visible canvas.
   *
   * @param material - Resolved transformed material bounds.
   * @param deviceScale - Effective physical-pixel scale.
   */
  public excludeDedicatedMaterial(
    material: RendererMaterial,
    deviceScale: number,
  ): void {
    const scissor = calculateMaterialScissor(
      material,
      deviceScale,
      this.rendererCanvas.height,
      0,
    );
    this.getPresentationContext().clearRect(
      scissor.x,
      this.rendererCanvas.height - scissor.y - scissor.height,
      scissor.width,
      scissor.height,
    );
  }

  /** Copy the complete WebGL drawing buffer into the stable event surface. */
  public captureMaterialFrame(): void {
    const { width, height } = this.rendererCanvas;
    if (this.materialsCanvas.width !== width) {
      this.materialsCanvas.width = width;
    }
    if (this.materialsCanvas.height !== height) {
      this.materialsCanvas.height = height;
    }
    const context = this.getMaterialsContext();
    context.clearRect(0, 0, width, height);
    context.drawImage(this.rendererCanvas, 0, 0, width, height);
  }

  /**
   * Reset material output while CSS fallback owns visible presentation.
   *
   * Resizing the WebGL canvas is the only context-independent way to guarantee
   * a transparent material frame when WebGL2 creation itself failed.
   */
  public resetMaterialFrames(width: number, height: number): void {
    this.rendererCanvas.width = width;
    this.rendererCanvas.height = height;
    this.resizePresentation(width, height);
    this.getPresentationContext().clearRect(0, 0, width, height);
    if (this.materialsCanvas.width !== width) {
      this.materialsCanvas.width = width;
    }
    if (this.materialsCanvas.height !== height) {
      this.materialsCanvas.height = height;
    }
    this.getMaterialsContext().clearRect(0, 0, width, height);
  }

  /**
   * Composite the current backdrop and complete material buffer for a parent.
   *
   * @param input - Physical viewport and crop coordinates.
   * @returns Stable core-owned canvas containing the complete composition.
   */
  public composeFullFrame(
    input: FullFrameComposition,
  ): HTMLCanvasElement {
    const canvas = this.fullCompositeCanvas;
    if (canvas.width !== input.width) {
      canvas.width = input.width;
    }
    if (canvas.height !== input.height) {
      canvas.height = input.height;
    }
    const context = this.getFullCompositeContext();
    context.clearRect(0, 0, input.width, input.height);
    if (input.hasBackdrop) {
      context.drawImage(
        this.compositeCanvas,
        input.sourceX,
        input.sourceY,
        input.width,
        input.height,
        0,
        0,
        input.width,
        input.height,
      );
    }
    context.drawImage(
      this.materialsCanvas,
      input.sourceX,
      input.sourceY,
      input.width,
      input.height,
      0,
      0,
      input.width,
      input.height,
    );
    return canvas;
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
      this.materialsCanvas,
      this.fullCompositeCanvas,
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

  private getMaterialsContext(): CanvasRenderingContext2D {
    this.materialsContext ??= this.materialsCanvas.getContext('2d');
    if (!this.materialsContext) {
      throw new GlassError(
        'RENDER_FAILED',
        'Failed to acquire the liquid-glass materials 2D context.',
        { phase: 'render' },
      );
    }
    return this.materialsContext;
  }

  private getFullCompositeContext(): CanvasRenderingContext2D {
    this.fullCompositeContext ??= this.fullCompositeCanvas.getContext('2d');
    if (!this.fullCompositeContext) {
      throw new GlassError(
        'RENDER_FAILED',
        'Failed to acquire the liquid-glass full-composite 2D context.',
        { phase: 'render' },
      );
    }
    return this.fullCompositeContext;
  }
}
