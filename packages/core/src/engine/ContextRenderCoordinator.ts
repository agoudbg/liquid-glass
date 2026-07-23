import { GlassError, type GlassErrorContext } from '../errors/GlassError';
import type { WebGLRenderer } from '../renderer';
import type { CanvasRenderPayload } from '../types/context';
import type { MaterialsRenderedPayload } from '../types/events';
import { type ContextBackdropCapture, ContextBackdropComposite } from './ContextBackdropComposite';
import { ContextCanvasPipeline } from './ContextCanvasPipeline';
import { resolveRendererMaterials } from './material-resolver';
import type {
  BackdropRegistration,
  MaterialRegistration,
} from './registrations';
import type { GlassEngineRuntime } from './runtime';

/** Lazy context state and event callbacks required by synchronous rendering. */
export interface ContextRenderCoordinatorCallbacks {
  /** Read the effective device scale for backdrop composition. */
  getDeviceScale(): number;
  /** Read the current material registrations in context-owned order. */
  getMaterials(): Iterable<MaterialRegistration>;
  /** Read the renderer after context construction has completed. */
  getRenderer(): WebGLRenderer | null;
  /** Report whether a DOM capture scheduler owns the current render failure. */
  isDomCaptureActive(): boolean;
  /** Read whether CSS fallback presentation is currently active. */
  isFallbackMode(): boolean;
  /** Emit metadata for a freshly drawn custom source. */
  onBackdropCaptured(capture: ContextBackdropCapture): void;
  /** Surface a synchronous render failure outside DOM capture scheduling. */
  onError(context: GlassErrorContext): void;
  /** Emit the complete physical presentation canvas payload. */
  onFullCanvasRendered(payload: CanvasRenderPayload): void;
  /** Emit the material-render completion payload. */
  onMaterialsRendered(payload: MaterialsRenderedPayload): void;
}

/**
 * Own synchronous backdrop composition and material rendering for one context.
 *
 * Scheduling, fallback policy, renderer lifecycle, and DOM capture remain with
 * `GlassContextImpl`; this coordinator only executes an already-requested frame.
 */
export class ContextRenderCoordinator {
  private readonly canvases: ContextCanvasPipeline;
  private readonly backdropComposite: ContextBackdropComposite;
  private backdropTextureReady = false;

  /** Create the context-owned canvas pipeline and its backdrop drawing facade. */
  public constructor(
    private readonly container: HTMLElement,
    private readonly sources: Map<string, BackdropRegistration>,
    private readonly runtime: GlassEngineRuntime,
    private readonly callbacks: ContextRenderCoordinatorCallbacks,
  ) {
    this.canvases = new ContextCanvasPipeline(runtime);
    this.backdropComposite = new ContextBackdropComposite(
      this.canvases.compositeCanvas,
      this.canvases.presentationCanvas,
      sources,
      callbacks.onBackdropCaptured,
    );
  }

  /** Internal canvas that owns the WebGL renderer and context events. */
  public get rendererCanvas(): HTMLCanvasElement {
    return this.canvases.rendererCanvas;
  }

  /** Visible 2D canvas appended to the context container. */
  public get presentationCanvas(): HTMLCanvasElement {
    return this.canvases.presentationCanvas;
  }

  /** Render one frame, optionally reusing the last uploaded backdrop texture. */
  public renderFrame(refreshBackdrop: boolean = true): void {
    try {
      const containerRect = this.container.getBoundingClientRect();
      const renderer = this.callbacks.getRenderer();
      if (this.callbacks.isFallbackMode() || !renderer) {
        this.renderFallbackFrame(containerRect, refreshBackdrop);
        return;
      }

      renderer.resize(containerRect.width, containerRect.height);
      this.canvases.resizePresentationToRenderer();
      if (this.sources.size === 0) {
        this.backdropTextureReady = false;
        renderer.clear();
        this.canvases.presentRendererFrame();
        this.emitRenderedFrame();
        return;
      }

      if (refreshBackdrop || !this.backdropTextureReady) {
        this.backdropTextureReady = false;
        this.backdropComposite.draw(
          containerRect,
          this.callbacks.getDeviceScale(),
        );
        renderer.uploadBackdrop(this.canvases.compositeCanvas);
        this.backdropTextureReady = true;
      }
      const materials = resolveRendererMaterials(
        this.callbacks.getMaterials(),
        this.container,
        containerRect,
        this.runtime,
      );
      renderer.render(materials);
      this.canvases.presentRendererFrame();
      this.emitRenderedFrame();
    } catch (error) {
      const contextual = GlassError.fromUnknown(
        error,
        'RENDER_FAILED',
        'Failed to composite the liquid-glass context.',
        { phase: 'render' },
      );
      if (!this.callbacks.isDomCaptureActive()) {
        this.callbacks.onError(contextual.toContext());
      }
      throw contextual;
    }
  }

  /** Idempotently release every canvas bitmap owned by this coordinator. */
  public destroy(): void {
    this.canvases.destroy();
  }

  private renderFallbackFrame(
    containerRect: DOMRectReadOnly,
    refreshBackdrop: boolean,
  ): void {
    const scale = this.callbacks.getDeviceScale();
    const width = Math.max(1, Math.round(containerRect.width * scale));
    const height = Math.max(1, Math.round(containerRect.height * scale));
    const resized = this.canvases.resizePresentation(width, height);
    if (this.sources.size > 0 && (refreshBackdrop || resized)) {
      // Preserve the independent scale read used by the original composite path.
      this.backdropComposite.draw(
        containerRect,
        this.callbacks.getDeviceScale(),
      );
    }
    this.emitRenderedFrame();
  }

  private emitRenderedFrame(): void {
    const payload = { canvas: this.canvases.presentationCanvas };
    this.callbacks.onMaterialsRendered(payload);
    this.callbacks.onFullCanvasRendered({
      ...payload,
      width: this.canvases.presentationCanvas.width,
      height: this.canvases.presentationCanvas.height,
    });
  }
}
