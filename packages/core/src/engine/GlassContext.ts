import { GlassError, type GlassErrorContext } from '../errors/GlassError';
import { TypedEventEmitter } from '../events/TypedEventEmitter';
import { WebGLRenderer } from '../renderer';
import type {
  BackdropSourceConfig,
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  DomBackdropSourceConfig,
  GlassContext,
  GlassContextOptions,
  MaterialConfig,
  MaterialHandle,
  TextureDirtyReason,
} from '../types/context';
import type { DiagnosticsSnapshot } from '../types/diagnostics';
import type { GlassEventMap } from '../types/events';
import type { ProxyInterface } from '../types/external-material';
import {
  rethrowAfterRunningTasks,
  runTasksPreservingFirstFailure,
} from '../utils/run-tasks';
import { readBackdropSourceKind } from './backdrop-config';
import { CanvasBackdropSourceController } from './CanvasBackdropSourceController';
import { resolveContextContent } from './context-content';
import { resolveContextDeviceScale } from './context-device-scale';
import { createDiagnosticsListenerError } from './context-diagnostics-error';
import { applyCurrentContextFallback, type ContextFallbackTransitionCallbacks, transitionForcedContextFallback } from './context-fallback-transition';
import {
  assertContextRegistrationUsable,
  assertContextUsable,
} from './context-lifecycle-guards';
import {
  resolveContextPrecision,
  snapshotContextOptions,
} from './context-options';
import { ContextPresentation } from './context-presentation';
import { assertContextContainer, validateContextBoolean, validateTextureDirtyReason } from './context-public-input';
import { ContextRefreshController } from './context-refresh';
import { teardownContext } from './context-teardown';
import { ContextDiagnosticsController } from './ContextDiagnosticsController';
import { ContextEventController } from './ContextEventController';
import { ContextRenderCoordinator } from './ContextRenderCoordinator';
import { ContextRendererLifecycleController } from './ContextRendererLifecycleController';
import {
  assertContextRendererOptions,
  createContextRenderer,
} from './create-context-renderer';
import { DomBackdropCaptureController } from './DomBackdropCaptureController';
import { FallbackController } from './FallbackController';
import { cloneMaterialConfig } from './material-config';
import { MaterialPresentationController } from './MaterialPresentationController';
import { createDelegatedMaterialFeedbackPublisher, createMaterialThemeFeedbackPublisher } from './publish-material-theme-feedback';
import type { BackdropRegistration } from './registrations';
import type { GlassEngineRuntime } from './runtime';

/** Concrete core-owned implementation of the public `GlassContext` contract. */
export class GlassContextImpl implements GlassContext {
  /** Uniform presentation canvas owned and appended by core. */
  public readonly canvas: HTMLCanvasElement;
  /** Whether the context has released every registration and graphics resource. */
  public get destroyed(): boolean {
    return this.isDestroyed;
  }
  /** Whether CSS fallback presentation is currently active. */
  public get fallbackMode(): boolean {
    return this.fallback.effective;
  }
  private readonly renderer: WebGLRenderer | null;
  private readonly renderCoordinator: ContextRenderCoordinator;
  private readonly emitter = new TypedEventEmitter<GlassEventMap>();
  private readonly sources = new Map<string, BackdropRegistration>();
  private readonly materials: MaterialPresentationController;
  private readonly canvasSources: CanvasBackdropSourceController;
  private readonly domCapture: DomBackdropCaptureController;
  private readonly contextEvents: ContextEventController;
  private readonly presentation: ContextPresentation;
  private readonly fallback: FallbackController;
  private readonly refreshController: ContextRefreshController;
  private readonly diagnostics: ContextDiagnosticsController;
  private readonly rendererLifecycle: ContextRendererLifecycleController;
  private readonly content: HTMLElement;
  private optionsSnapshot: GlassContextOptions;
  private precision: number;
  private destroyStarted = false;
  private isDestroyed = false;
  private viewportMode = false;
  /**
   * Create one context with a core-owned uniform canvas.
   *
   * @param container - DOM container defining layout and canvas ownership.
   * @param options - Context quality and presentation options.
   * @param runtime - Lazy browser operations or deterministic test doubles.
   * @param onDestroyed - Engine callback used to forget this context.
   */
  public constructor(
    container: HTMLElement,
    options: GlassContextOptions,
    private readonly runtime: GlassEngineRuntime,
    private readonly onDestroyed: () => void,
  ) {
    assertContextContainer(container);
    this.content = resolveContextContent(container);
    this.optionsSnapshot = snapshotContextOptions(options);
    this.precision = resolveContextPrecision(this.optionsSnapshot);
    this.fallback = new FallbackController(this.optionsSnapshot);
    this.renderCoordinator = new ContextRenderCoordinator(
      container,
      this.content,
      this.sources,
      runtime,
      {
        getDeviceScale: () => resolveContextDeviceScale(this.runtime, this.precision),
        getExternalMaterials: (containerRect, contentOffset) => (
          this.materials.resolveExternalMaterials(containerRect, contentOffset)
        ),
        getMaterials: () => this.materials.values(),
        getRenderMode: () => this.optionsSnapshot.renderMode ?? 'uniform',
        getRenderer: () => this.renderer,
        getThemeColorThresholds: () => (
          this.optionsSnapshot.themeColorThresholds
        ),
        hasFullCanvasRenderedListeners: () => (
          this.emitter.listenerCount('fullCanvasRendered') > 0
        ),
        hasMaterialsRenderedListeners: () => (
          this.emitter.listenerCount('materialsRendered') > 0
        ),
        isDomCaptureActive: () => this.domCapture.active,
        isFallbackMode: () => this.fallbackMode,
        isScrollable: () => this.optionsSnapshot.scrollable ?? false,
        isViewportMode: () => this.viewportMode,
        isDiagnosticsEnabled: () => this.diagnostics.isEnabled,
        onBackdropCaptured: (capture) => {
          this.diagnostics.recordCapture(null);
          this.emitter.emit('backdropCaptured', capture);
        },
        onError: (context) => this.emitError(context),
        onFrameMeasured: (measurement) => this.diagnostics.recordFrame(measurement),
        onFullCanvasRendered: (payload) => this.emitter.emit(
          'fullCanvasRendered',
          payload,
        ),
        onMaterialsRendered: (payload) => this.emitter.emit(
          'materialsRendered',
          payload,
        ),
        onPresentationSize: (width, height) => (
          this.presentation.syncCanvasSize(width, height)
        ),
        onThemeSampled: createMaterialThemeFeedbackPublisher(
          () => this.materials,
          this.emitter,
        ),
      },
    );
    this.canvas = this.renderCoordinator.presentationCanvas;
    this.presentation = new ContextPresentation(
      container,
      this.content,
      this.canvas,
      this.optionsSnapshot,
    );
    this.materials = new MaterialPresentationController(
      container,
      this.content,
      runtime,
      {
        assertContextUsable: () => this.assertUsable(),
        isContextDestroyed: () => this.destroyStarted,
        onAdded: (registration) => this.emitter.emit(
          'materialAdded',
          registration.id,
          cloneMaterialConfig(registration.config),
        ),
        onRemoved: (registration) => this.emitter.emit(
          'materialRemoved',
          registration.id,
        ),
        onUpdated: (registration, changes) => this.emitter.emit(
          'materialUpdated',
          registration.id,
          changes,
        ),
        onError: (error) => this.emitError(error.toContext()),
        onFeedback: createDelegatedMaterialFeedbackPublisher(this.emitter),
        renderImmediately: () => this.renderCoordinator.renderFrame(false),
        renderMaterials: () => this.renderCoordinator.renderFrame(false),
      },
    );
    this.domCapture = new DomBackdropCaptureController(
      container,
      this.sources,
      runtime,
      {
        assertRegistration: (registration) => assertContextRegistrationUsable(
          this.destroyStarted,
          registration,
        ),
        getDeviceScale: () => resolveContextDeviceScale(this.runtime, this.precision),
        getOptions: () => this.optionsSnapshot,
        getViewportMode: () => this.viewportMode,
        isContextDestroyed: () => this.destroyStarted,
        isDiagnosticsEnabled: () => this.diagnostics.isEnabled,
        onCaptured: (payload, durationMs) => {
          this.diagnostics.recordCapture(durationMs);
          this.emitter.emit('backdropCaptured', payload);
        },
        onError: (context) => this.emitError(context),
        removeSource: (registration) => this.removeSource(registration),
        renderFrame: () => this.renderCoordinator.renderFrame(),
        requestComposite: (reason) => this.requestCompositeWithoutDomCapture(reason),
      },
    );
    this.refreshController = new ContextRefreshController(
      this.emitter,
      this.domCapture,
      this.renderCoordinator,
      () => this.fallbackMode,
    );
    this.canvasSources = new CanvasBackdropSourceController(
      this.sources,
      runtime,
      {
        assertRegistration: (registration) => assertContextRegistrationUsable(
          this.destroyStarted,
          registration,
        ),
        requestComposite: (reason) => this.requestCompositeWithoutDomCapture(reason),
        sourceAdded: (registration) => this.domCapture.sourceAdded(registration),
        sourceRemoved: (registration) => this.domCapture.sourceRemoved(registration),
        sourceUpdated: (registration) => this.domCapture.sourceUpdated(registration),
      },
    );
    this.rendererLifecycle = new ContextRendererLifecycleController({
      applyFallbackModeChange: () => this.applyFallbackModeChange(),
      emitRestoreError: (error) => this.emitError(error.toContext()),
      invalidateBackdropTexture: () => (
        this.renderCoordinator.invalidateBackdropTexture()
      ),
      isDestroying: () => this.destroyStarted,
      recordContextLoss: () => this.diagnostics.recordContextLoss(),
      recordContextRestore: () => this.diagnostics.recordContextRestore(),
      refreshFallback: () => this.refresh('fallback'),
      setContextLost: (lost) => this.fallback.setContextLost(lost),
    });
    let renderer: WebGLRenderer | null = null;
    try {
      renderer = createContextRenderer(
        this.renderCoordinator.rendererCanvas,
        this.precision,
        runtime,
        this.optionsSnapshot,
        {
          onContextLost: () => this.rendererLifecycle.handleLost(),
          onContextRestored: () => this.rendererLifecycle.handleRestored(),
          onContextRestoreError: (error) => (
            this.rendererLifecycle.handleRestoreError(error)
          ),
        },
      );
      this.fallback.setRendererUnavailable(renderer === null);
      this.renderer = renderer;
      this.presentation.setFallbackMode(this.fallbackMode);
      this.renderCoordinator.setFallbackMode(this.fallbackMode);
      this.materials.setFallbackMode(this.fallbackMode);
      this.domCapture.setPaused(this.fallbackMode);
      this.content.appendChild(this.canvas);
      this.contextEvents = new ContextEventController(
        container,
        runtime,
        {
          onLayout: () => {
            this.domCapture.markAllDirty();
            this.refresh('layout');
          },
          onScroll: () => this.refresh('scroll'),
          onScrollPosition: () => this.presentation.syncScrollPosition(),
          onBlurredChange: (blurred) => this.materials.setBlurred(blurred),
        },
        this.optionsSnapshot.enableBlurredEffect ?? false,
        this.content,
      );
      this.diagnostics = new ContextDiagnosticsController(
        runtime,
        {
          contextEvents: this.contextEvents,
          domCapture: this.domCapture,
          fallback: this.fallback,
          materials: this.materials,
          readContextState: () => ({
            debugEnabled: this.optionsSnapshot.debug ?? false,
            destroyed: this.isDestroyed,
            destroying: this.destroyStarted && !this.isDestroyed,
            options: this.optionsSnapshot,
            precision: this.precision,
            viewportMode: this.viewportMode,
          }),
          renderCoordinator: this.renderCoordinator,
          renderer: this.renderer,
          sources: this.sources,
        },
        (snapshot) => this.emitter.emit('diagnosticsUpdated', snapshot),
        (error) => this.emitter.emit(
          'error',
          createDiagnosticsListenerError(error),
        ),
      );
    } catch (error) {
      const contextual = GlassError.fromUnknown(
        error,
        'LIFECYCLE_FAILED',
        'Failed to attach the liquid-glass presentation canvas.',
        { phase: 'lifecycle' },
      );
      rethrowAfterRunningTasks(contextual, [
        () => renderer?.destroy(),
        () => this.materials.destroy(),
        () => this.domCapture.destroy(),
        () => this.presentation.destroy(),
        () => this.renderCoordinator.destroy(),
        () => {
          if (this.canvas.parentNode === this.content) {
            this.content.removeChild(this.canvas);
          }
        },
      ]);
    }
  }
  /** Register a DOM source and schedule its first bounded capture. */
  public addBackdropSource(
    config: DomBackdropSourceConfig,
  ): BackdropSourceHandle<DomBackdropSourceConfig>;
  /** Register a core-owned custom canvas source. */
  public addBackdropSource(
    config: CanvasBackdropSourceConfig,
  ): BackdropSourceHandle<CanvasBackdropSourceConfig>;
  /** Register a backdrop source and return its stable lifecycle handle. */
  public addBackdropSource(
    config: BackdropSourceConfig,
  ): BackdropSourceHandle {
    this.assertUsable();
    readBackdropSourceKind(config);
    const handle = config.kind === 'dom'
      ? this.domCapture.add(config)
      : this.canvasSources.add(config);
    this.diagnostics.publish();
    return handle;
  }
  /** Register a measurable material and return its lifecycle handle. */
  public addMaterial(config: MaterialConfig): MaterialHandle {
    return this.materials.add(config);
  }
  /** Read detached diagnostics without requiring a live context. */
  public getDiagnostics(): DiagnosticsSnapshot {
    return this.diagnostics.getSnapshot();
  }
  /** Request diagnostic loss on the internal renderer context. */
  public requestContextLoss(): boolean {
    this.assertUsable();
    return this.renderer?.requestContextLoss() ?? false;
  }
  /** Request diagnostic restoration on the internal renderer context. */
  public requestContextRestore(): boolean {
    this.assertUsable();
    return this.renderer?.requestContextRestore() ?? false;
  }
  /** Replace context options in place and synchronously apply presentation changes. */
  public updateOptions(options: GlassContextOptions): void {
    this.assertUsable();
    const nextSnapshot = snapshotContextOptions(options);
    assertContextRendererOptions(this.renderer, nextSnapshot);
    const nextPrecision = resolveContextPrecision(nextSnapshot);
    this.renderer?.setRenderScale(nextPrecision);
    this.optionsSnapshot = nextSnapshot;
    this.precision = nextPrecision;
    this.renderCoordinator.syncMaterialModes();
    const fallbackChanged = this.fallback.updateOptions(nextSnapshot);
    this.domCapture.markAllDirty();
    this.presentation.update(nextSnapshot);
    this.contextEvents.refreshTargets();
    this.contextEvents.setBlurredEffectEnabled(
      nextSnapshot.enableBlurredEffect ?? false,
    );
    if (fallbackChanged) {
      this.applyFallbackModeChange();
    }
    this.diagnostics.setEnabled(nextSnapshot.debug ?? false);
    this.refresh('structural');
  }
  /** Return the stable target-side external material registration surface. */
  public createProxyInterface(): ProxyInterface {
    return this.materials.createProxyInterface();
  }
  /** Force or release CSS fallback presentation. */
  public setFallbackMode(enabled: boolean): void {
    this.assertUsable();
    transitionForcedContextFallback(
      this.fallback,
      validateContextBoolean(enabled, 'context.setFallbackMode.enabled'),
      this.getFallbackTransitionCallbacks(),
    );
  }
  /** Toggle viewport-limited mode; bounded capture is completed in P4. */
  public setViewportMode(enabled: boolean): void {
    this.assertUsable();
    if (this.viewportMode !== validateContextBoolean(enabled, 'context.setViewportMode.enabled')) {
      this.viewportMode = enabled;
      this.presentation.setViewportMode(enabled);
      this.domCapture.markAllDirty();
      runTasksPreservingFirstFailure([
        () => this.emitter.emit('viewportModeChanged', enabled),
        () => this.refresh('viewport'),
      ]);
    }
  }
  /** Request capture, composition, and material rendering for one dirty reason. */
  public refresh(reason: TextureDirtyReason = 'external'): void {
    this.assertUsable();
    this.refreshController.refresh(validateTextureDirtyReason(reason));
  }
  /** Subscribe to a typed context event and return an unsubscribe callback. */
  public on<Event extends keyof GlassEventMap>(
    event: Event,
    handler: GlassEventMap[Event],
  ): () => void {
    this.assertUsable();
    this.emitter.on(event, handler);
    return () => this.emitter.off(event, handler);
  }
  /** Unsubscribe a typed context event handler. */
  public off<Event extends keyof GlassEventMap>(
    event: Event,
    handler: GlassEventMap[Event],
  ): void {
    this.emitter.off(event, handler);
  }
  /** Idempotently release registrations, graphics resources, and the canvas. */
  public destroy(): void {
    if (this.destroyStarted) {
      return;
    }
    this.destroyStarted = true;
    teardownContext({
      canvas: this.canvas,
      content: this.content,
      contextEvents: this.contextEvents,
      diagnostics: this.diagnostics,
      domCapture: this.domCapture,
      emitter: this.emitter,
      markDestroyed: () => {
        this.isDestroyed = true;
      },
      materials: this.materials,
      onDestroyed: this.onDestroyed,
      presentation: this.presentation,
      renderer: this.renderer,
      renderCoordinator: this.renderCoordinator,
      sources: this.sources,
    });
  }
  private applyFallbackModeChange(): void {
    applyCurrentContextFallback(
      this.fallback,
      this.getFallbackTransitionCallbacks(),
    );
  }
  private emitError(context: GlassErrorContext): void {
    this.diagnostics.recordError();
    this.emitter.emit('error', context);
  }
  private requestCompositeWithoutDomCapture(reason: TextureDirtyReason): void {
    this.refreshController.composite(reason);
  }
  private getFallbackTransitionCallbacks(): ContextFallbackTransitionCallbacks {
    return {
      preRevealRender: () => this.renderer && this.renderCoordinator.renderFrame(),
      publishMaterials: () => this.materials.publishPresentations(),
      publishMode: (enabled) => this.emitter.emit('fallbackModeChanged', enabled),
      refresh: () => this.refresh('fallback'),
      setCapturePaused: (enabled) => this.domCapture.setPaused(enabled),
      setMaterialMode: (enabled) => this.materials.setFallbackMode(enabled, false),
      setPresentationMode: (enabled) => this.presentation.setFallbackMode(enabled),
      setRenderMode: (enabled) => this.renderCoordinator.setFallbackMode(enabled),
    };
  }
  private removeSource(registration: BackdropRegistration): void {
    if (registration.destroyed) {
      return;
    }
    registration.destroyed = true;
    this.sources.delete(registration.id);
    runTasksPreservingFirstFailure([
      () => this.domCapture.sourceRemoved(registration),
      ...this.destroyStarted ? [] : [() => this.refresh('structural')],
    ]);
  }
  private assertUsable(): void {
    assertContextUsable(this.destroyStarted);
  }
}
