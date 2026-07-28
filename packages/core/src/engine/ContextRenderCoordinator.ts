import { GlassError, type GlassErrorContext } from '../errors/GlassError';
import type { WebGLRenderer } from '../renderer';
import type {
  AutomaticBackgroundColorMode,
  CanvasRenderPayload,
  RenderMode,
  ThemeColorThresholds,
} from '../types/context';
import type { MaterialsRenderedPayload } from '../types/events';
import { runTasksPreservingFirstFailure } from '../utils/run-tasks';
import { parseCSSTransformMatrix } from '../utils/transforms';
import {
  type BackdropPixelData,
  captureBackdropPixels,
  resolveThemeColorThresholds,
  sampleBackdropThemes,
} from './backdrop-theme';
import {
  measureFullContentPresentation,
  resolveContextLogicalDimension,
} from './context-render-size';
import { type ContextBackdropCapture, ContextBackdropComposite } from './ContextBackdropComposite';
import { ContextCanvasPipeline } from './ContextCanvasPipeline';
import type { DiagnosticsFrameMeasurement } from './ContextDiagnosticsController';
import { ContextMaterialRenderController } from './ContextMaterialRenderController';
import {
  type ContextRenderDiagnosticsState,
  readDiagnosticsTimestamp,
  resolveDiagnosticsDuration,
} from './diagnostics-internal';
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
  /** Read the current context-level default presentation mode. */
  getRenderMode(): RenderMode;
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
  /** Report whether optional frame measurements are enabled. */
  isDiagnosticsEnabled(): boolean;
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
  /** Record one successfully completed frame measurement. */
  onFrameMeasured(measurement: DiagnosticsFrameMeasurement): void;
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
  private readonly materialRenderer: ContextMaterialRenderController;
  private backdropPixels: BackdropPixelData | null = null;
  private backdropTextureReady = false;
  private destroyed = false;

  /** Create the context-owned canvas pipeline and its backdrop drawing facade. */
  public constructor(
    private readonly container: HTMLElement,
    private readonly content: HTMLElement,
    private readonly sources: Map<string, BackdropRegistration>,
    private readonly runtime: GlassEngineRuntime,
    private readonly callbacks: ContextRenderCoordinatorCallbacks,
  ) {
    this.canvases = new ContextCanvasPipeline(runtime);
    this.materialRenderer = new ContextMaterialRenderController(runtime);
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

  /** Mark the uploaded backdrop unavailable after graphics context loss. */
  public invalidateBackdropTexture(): void {
    this.backdropTextureReady = false;
  }

  /** Return detached presentation state without exposing owned canvases. */
  public getDiagnosticsState(): ContextRenderDiagnosticsState {
    return {
      backdropTextureReady: this.backdropTextureReady,
      height: this.canvases.presentationCanvas.height,
      ownedCanvases: this.destroyed
        ? 0
        : 5 + this.materialRenderer.getOwnedCanvasCount(),
      width: this.canvases.presentationCanvas.width,
    };
  }

  /** Synchronize fallback visibility across every dedicated canvas. */
  public setFallbackMode(enabled: boolean): void {
    this.materialRenderer.setFallbackMode(enabled);
  }

  /** Synchronize effective material modes without waiting for the next frame. */
  public syncMaterialModes(): void {
    this.materialRenderer.syncRegistrations(
      [...this.callbacks.getMaterials()],
      this.callbacks.getRenderMode(),
    );
  }

  /** Render one frame, optionally reusing the last uploaded backdrop texture. */
  public renderFrame(refreshBackdrop: boolean = true): void {
    const startedAt = this.callbacks.isDiagnosticsEnabled()
      ? readDiagnosticsTimestamp(this.runtime)
      : null;
    try {
      const containerRect = this.container.getBoundingClientRect();
      const containerMatrix = parseCSSTransformMatrix(
        this.runtime.getComputedStyle(this.container).transform,
      );
      const hasLinearTransform = containerMatrix[0] !== 1
        || containerMatrix[1] !== 0
        || containerMatrix[2] !== 0
        || containerMatrix[3] !== 1;
      const logicalWidth = resolveContextLogicalDimension(
        this.container.clientWidth,
        containerRect.width,
        hasLinearTransform,
      );
      const logicalHeight = resolveContextLogicalDimension(
        this.container.clientHeight,
        containerRect.height,
        hasLinearTransform,
      );
      const fullContentPresentation = this.callbacks.isScrollable()
        && !this.callbacks.isViewportMode();
      const presentationSize = fullContentPresentation
        ? measureFullContentPresentation(
            this.content,
            this.canvases.presentationCanvas,
            logicalWidth,
            logicalHeight,
          )
        : { width: logicalWidth, height: logicalHeight };
      const presentationWidth = presentationSize.width;
      const presentationHeight = presentationSize.height;
      const contentOffset = fullContentPresentation
        ? { x: this.content.scrollLeft, y: this.content.scrollTop }
        : { x: 0, y: 0 };
      const registrations = [...this.callbacks.getMaterials()];
      const renderMode = this.callbacks.getRenderMode();
      this.materialRenderer.syncRegistrations(registrations, renderMode);
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
          logicalWidth,
          logicalHeight,
          refreshBackdrop,
          contentOffset,
        );
        this.measureFrame(startedAt, 0, null);
        return;
      }

      renderer.resize(presentationWidth, presentationHeight);
      this.canvases.resizePresentationToRenderer();
      const materials = resolveRendererMaterials(
        registrations,
        this.container,
        containerRect,
        this.runtime,
        contentOffset,
      );
      if (this.sources.size === 0) {
        this.backdropPixels = null;
        this.backdropTextureReady = false;
        const frameResult = this.materialRenderer.render({
          deviceScale: this.callbacks.getDeviceScale(),
          excludeDedicated: (material, deviceScale) => {
            this.canvases.excludeDedicatedMaterial(
              material,
              deviceScale,
            );
          },
          hasBackdrop: false,
          materials,
          presentUniform: () => this.canvases.presentRendererFrame(),
          registrations,
          renderer,
          renderMode,
          source: this.canvases.rendererCanvas,
        });
        this.canvases.captureMaterialFrame();
        this.emitRenderedFrame(
          undefined,
          false,
          logicalWidth,
          logicalHeight,
          contentOffset,
        );
        this.measureFrame(
          startedAt,
          frameResult.drawCalls,
          frameResult.glError,
        );
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
      let themeColors:
        | Readonly<Record<string, AutomaticBackgroundColorMode>>
        | undefined;
      const frameResult = this.materialRenderer.render({
        beforePresentUniform: () => {
          themeColors = this.sampleThemes(
            materials,
            presentationWidth,
            presentationHeight,
          );
        },
        deviceScale: this.callbacks.getDeviceScale(),
        excludeDedicated: (material, deviceScale) => {
          this.canvases.excludeDedicatedMaterial(
            material,
            deviceScale,
          );
        },
        hasBackdrop: true,
        materials,
        presentUniform: () => this.canvases.presentRendererFrame(),
        registrations,
        renderer,
        renderMode,
        source: this.canvases.rendererCanvas,
      });
      this.canvases.captureMaterialFrame();
      this.emitRenderedFrame(
        themeColors,
        true,
        logicalWidth,
        logicalHeight,
        contentOffset,
      );
      this.measureFrame(
        startedAt,
        frameResult.drawCalls,
        frameResult.glError,
      );
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
    this.destroyed = true;
    this.backdropPixels = null;
    this.backdropTextureReady = false;
    runTasksPreservingFirstFailure([
      () => this.materialRenderer.destroy(),
      () => this.canvases.destroy(),
    ]);
  }

  private measureFrame(
    startedAt: number | null,
    drawCalls: number,
    glError: number | null,
  ): void {
    if (startedAt === null) return;
    this.callbacks.onFrameMeasured({
      drawCalls,
      durationMs: resolveDiagnosticsDuration(
        startedAt,
        readDiagnosticsTimestamp(this.runtime),
      ),
      glError,
    });
  }

  private renderFallbackFrame(
    containerRect: DOMRectReadOnly,
    logicalWidth: number,
    logicalHeight: number,
    viewportWidth: number,
    viewportHeight: number,
    refreshBackdrop: boolean,
    contentOffset: { x: number; y: number },
  ): void {
    const scale = this.callbacks.getDeviceScale();
    const width = Math.max(1, Math.round(Math.max(1, logicalWidth) * scale));
    const height = Math.max(1, Math.round(Math.max(1, logicalHeight) * scale));
    const resized = this.canvases.presentationCanvas.width !== width
      || this.canvases.presentationCanvas.height !== height;
    this.canvases.resetMaterialFrames(width, height);
    if (this.sources.size > 0 && (refreshBackdrop || resized)) {
      // Preserve the independent scale read used by the original composite path.
      this.backdropComposite.draw(
        containerRect,
        this.callbacks.getDeviceScale(),
        contentOffset,
      );
    }
    this.emitRenderedFrame(
      undefined,
      this.sources.size > 0,
      viewportWidth,
      viewportHeight,
      contentOffset,
    );
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
    hasBackdrop: boolean = false,
    viewportWidth: number = this.canvases.presentationCanvas.width,
    viewportHeight: number = this.canvases.presentationCanvas.height,
    contentOffset: { x: number; y: number } = { x: 0, y: 0 },
  ): void {
    const scale = this.callbacks.getDeviceScale();
    const width = Math.max(1, Math.round(Math.max(1, viewportWidth) * scale));
    const height = Math.max(1, Math.round(Math.max(1, viewportHeight) * scale));
    const fullCanvas = this.canvases.composeFullFrame({
      hasBackdrop,
      height,
      sourceX: contentOffset.x * scale,
      sourceY: contentOffset.y * scale,
      width,
    });
    const payload = { canvas: this.canvases.materialsCanvas };
    this.callbacks.onMaterialsRendered(themeColors === undefined
      ? payload
      : { ...payload, themeColors });
    this.callbacks.onFullCanvasRendered({
      canvas: fullCanvas,
      width,
      height,
    });
  }
}
