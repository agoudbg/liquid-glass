import { GlassError, type GlassErrorContext } from '../errors/GlassError';
import type { WebGLRenderer } from '../renderer';
import type {
  AutomaticBackgroundColorMode,
  CanvasRenderPayload,
  ThemeColorThresholds,
} from '../types/context';
import type { MaterialsRenderedPayload } from '../types/events';
import { parseCSSTransformMatrix } from '../utils/transforms';
import {
  type BackdropPixelData,
  captureBackdropPixels,
  resolveThemeColorThresholds,
  sampleBackdropThemes,
} from './backdrop-theme';
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
  /** Read the current automatic-theme threshold snapshot. */
  getThemeColorThresholds(): ThemeColorThresholds | undefined;
  /** Read the renderer after context construction has completed. */
  getRenderer(): WebGLRenderer | null;
  /** Report whether a DOM capture scheduler owns the current render failure. */
  isDomCaptureActive(): boolean;
  /** Read whether CSS fallback presentation is currently active. */
  isFallbackMode(): boolean;
  /** Read whether the context owns an internally scrolling content area. */
  isScrollable(): boolean;
  /** Read whether presentation is limited to the visible viewport. */
  isViewportMode(): boolean;
  /** Synchronize the visible canvas CSS box with logical renderer dimensions. */
  onPresentationSize(width: number, height: number): void;
  /** Emit metadata for a freshly drawn custom source. */
  onBackdropCaptured(capture: ContextBackdropCapture): void;
  /** Surface a synchronous render failure outside DOM capture scheduling. */
  onError(context: GlassErrorContext): void;
  /** Emit the complete physical presentation canvas payload. */
  onFullCanvasRendered(payload: CanvasRenderPayload): void;
  /** Emit the material-render completion payload. */
  onMaterialsRendered(payload: MaterialsRenderedPayload): void;
  /** Publish one material's current backdrop-derived theme. */
  onThemeSampled(
    materialId: string,
    themeColorMode: AutomaticBackgroundColorMode,
    averageLuminance: number,
  ): void;
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
  private backdropPixels: BackdropPixelData | null = null;
  private backdropTextureReady = false;

  /** Create the context-owned canvas pipeline and its backdrop drawing facade. */
  public constructor(
    private readonly container: HTMLElement,
    private readonly content: HTMLElement,
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
      const containerMatrix = parseCSSTransformMatrix(
        this.runtime.getComputedStyle(this.container).transform,
      );
      const hasLinearTransform = containerMatrix[0] !== 1
        || containerMatrix[1] !== 0
        || containerMatrix[2] !== 0
        || containerMatrix[3] !== 1;
      const logicalWidth = this.resolveLogicalDimension(
        this.container.clientWidth,
        containerRect.width,
        hasLinearTransform,
      );
      const logicalHeight = this.resolveLogicalDimension(
        this.container.clientHeight,
        containerRect.height,
        hasLinearTransform,
      );
      const fullContentPresentation = this.callbacks.isScrollable()
        && !this.callbacks.isViewportMode();
      const presentationSize = fullContentPresentation
        ? this.measureFullContentSize(logicalWidth, logicalHeight)
        : { width: logicalWidth, height: logicalHeight };
      const presentationWidth = presentationSize.width;
      const presentationHeight = presentationSize.height;
      const contentOffset = fullContentPresentation
        ? { x: this.content.scrollLeft, y: this.content.scrollTop }
        : { x: 0, y: 0 };
      this.callbacks.onPresentationSize(
        presentationWidth,
        presentationHeight,
      );
      const renderer = this.callbacks.getRenderer();
      if (this.callbacks.isFallbackMode() || !renderer) {
        this.renderFallbackFrame(
          containerRect,
          presentationWidth,
          presentationHeight,
          refreshBackdrop,
          contentOffset,
        );
        return;
      }

      renderer.resize(presentationWidth, presentationHeight);
      this.canvases.resizePresentationToRenderer();
      if (this.sources.size === 0) {
        this.backdropPixels = null;
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
          contentOffset,
        );
        renderer.uploadBackdrop(this.canvases.compositeCanvas);
        this.captureThemePixels();
        this.backdropTextureReady = true;
      }
      const materials = resolveRendererMaterials(
        this.callbacks.getMaterials(),
        this.container,
        containerRect,
        this.runtime,
        contentOffset,
      );
      renderer.render(materials);
      const themeColors = this.sampleThemes(
        materials,
        presentationWidth,
        presentationHeight,
      );
      this.canvases.presentRendererFrame();
      this.emitRenderedFrame(themeColors);
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
    this.backdropPixels = null;
    this.backdropTextureReady = false;
    this.canvases.destroy();
  }

  private renderFallbackFrame(
    containerRect: DOMRectReadOnly,
    logicalWidth: number,
    logicalHeight: number,
    refreshBackdrop: boolean,
    contentOffset: { x: number; y: number },
  ): void {
    const scale = this.callbacks.getDeviceScale();
    const width = Math.max(1, Math.round(Math.max(1, logicalWidth) * scale));
    const height = Math.max(1, Math.round(Math.max(1, logicalHeight) * scale));
    const resized = this.canvases.resizePresentation(width, height);
    if (this.sources.size > 0 && (refreshBackdrop || resized)) {
      // Preserve the independent scale read used by the original composite path.
      this.backdropComposite.draw(
        containerRect,
        this.callbacks.getDeviceScale(),
        contentOffset,
      );
    }
    this.emitRenderedFrame();
  }

  private resolveLogicalDimension(
    clientDimension: number,
    boundingDimension: number,
    useBoundingDimension: boolean,
  ): number {
    return !useBoundingDimension
      && Number.isFinite(clientDimension)
      && clientDimension >= 0
      ? clientDimension
      : boundingDimension;
  }

  private resolveContentDimension(
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

  private measureFullContentSize(
    fallbackWidth: number,
    fallbackHeight: number,
  ): { width: number; height: number } {
    const canvas = this.canvases.presentationCanvas;
    const display = canvas.style.display;
    // The owned canvas participates in scroll overflow, so exclude its previous
    // dimensions before measuring content that may have become smaller.
    canvas.style.display = 'none';
    try {
      return {
        width: this.resolveContentDimension(
          this.content.scrollWidth,
          this.content.clientWidth,
          fallbackWidth,
        ),
        height: this.resolveContentDimension(
          this.content.scrollHeight,
          this.content.clientHeight,
          fallbackHeight,
        ),
      };
    } finally {
      canvas.style.display = display;
    }
  }

  private sampleThemes(
    materials: ReturnType<typeof resolveRendererMaterials>,
    logicalWidth: number,
    logicalHeight: number,
  ): Readonly<Record<string, AutomaticBackgroundColorMode>> | undefined {
    if (!this.backdropPixels) return undefined;
    const samples = sampleBackdropThemes(
      this.backdropPixels,
      { width: logicalWidth, height: logicalHeight },
      materials,
      resolveThemeColorThresholds(
        this.callbacks.getThemeColorThresholds(),
      ),
    );
    const themeColors: Record<string, AutomaticBackgroundColorMode> = {};
    for (const [materialId, sample] of Object.entries(samples)) {
      themeColors[materialId] = sample.themeColorMode;
      this.callbacks.onThemeSampled(
        materialId,
        sample.themeColorMode,
        sample.averageLuminance,
      );
    }
    return themeColors;
  }

  private captureThemePixels(): void {
    try {
      this.backdropPixels = captureBackdropPixels(
        this.canvases.compositeCanvas,
      );
    } catch (error) {
      this.backdropPixels = null;
      const contextual = GlassError.fromUnknown(
        error,
        'CAPTURE_FAILED',
        'Failed to read backdrop pixels for automatic theme sampling.',
        { phase: 'capture' },
      );
      this.callbacks.onError(contextual.toContext());
    }
  }

  private emitRenderedFrame(
    themeColors?: Readonly<Record<string, AutomaticBackgroundColorMode>>,
  ): void {
    const payload = { canvas: this.canvases.presentationCanvas };
    this.callbacks.onMaterialsRendered(themeColors === undefined
      ? payload
      : { ...payload, themeColors });
    this.callbacks.onFullCanvasRendered({
      ...payload,
      width: this.canvases.presentationCanvas.width,
      height: this.canvases.presentationCanvas.height,
    });
  }
}
