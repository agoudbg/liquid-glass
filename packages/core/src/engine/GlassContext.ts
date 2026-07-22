import { GlassError } from '../errors/GlassError';
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
import type { GlassEventMap } from '../types/events';
import type { ProxyInterface } from '../types/external-material';
import { CanvasBackdropSourceController } from './CanvasBackdropSourceController';
import {
  resolveContextPrecision,
  snapshotContextOptions,
} from './context-options';
import { ContextPresentation } from './context-presentation';
import { ContextBackdropComposite } from './ContextBackdropComposite';
import { ContextEventController } from './ContextEventController';
import { createContextProxyInterface } from './create-context-proxy';
import {
  assertContextRendererOptions,
  createContextRenderer,
} from './create-context-renderer';
import { DomBackdropCaptureController } from './DomBackdropCaptureController';
import { FallbackController } from './FallbackController';
import { resolveRendererMaterials } from './material-resolver';
import { MaterialPresentationController } from './MaterialPresentationController';
import {
  type BackdropRegistration,
  type MaterialRegistration,
} from './registrations';
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
  private readonly compositeCanvas: HTMLCanvasElement;
  private readonly backdropComposite: ContextBackdropComposite;
  private readonly emitter = new TypedEventEmitter<GlassEventMap>();
  private readonly sources = new Map<string, BackdropRegistration>();
  private readonly materials: MaterialPresentationController;
  private readonly canvasSources: CanvasBackdropSourceController;
  private readonly domCapture: DomBackdropCaptureController;
  private readonly contextEvents: ContextEventController;
  private readonly presentation: ContextPresentation;
  private readonly fallback: FallbackController;
  private optionsSnapshot: GlassContextOptions;
  private precision: number;
  private isDestroyed = false;
  private viewportMode = false;
  private backdropTextureReady = false;

  /**
   * Create one context with a core-owned uniform canvas.
   *
   * @param container - DOM container defining layout and canvas ownership.
   * @param options - Context quality and presentation options.
   * @param runtime - Lazy browser operations or deterministic test doubles.
   * @param onDestroyed - Engine callback used to forget this context.
   */
  public constructor(
    private readonly container: HTMLElement,
    options: GlassContextOptions,
    private readonly runtime: GlassEngineRuntime,
    private readonly onDestroyed: () => void,
  ) {
    this.optionsSnapshot = snapshotContextOptions(options);
    this.precision = resolveContextPrecision(this.optionsSnapshot);
    this.fallback = new FallbackController(this.optionsSnapshot);
    this.canvas = runtime.createCanvas();
    this.compositeCanvas = runtime.createCanvas();
    this.backdropComposite = new ContextBackdropComposite(
      this.compositeCanvas,
      this.canvas,
      this.sources,
      (capture) => this.emitter.emit('backdropCaptured', capture),
    );
    this.presentation = new ContextPresentation(
      container,
      this.canvas,
      this.optionsSnapshot,
    );
    this.materials = new MaterialPresentationController(runtime, {
      assertContextUsable: () => this.assertUsable(),
      onAdded: (registration) => this.emitter.emit(
        'materialAdded',
        registration.id,
        registration.config,
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
      renderImmediately: () => this.renderFrame(false),
      renderMaterials: () => this.renderFrame(false),
    });
    this.domCapture = new DomBackdropCaptureController(
      container,
      this.sources,
      runtime,
      {
        assertRegistration: (registration) => this.assertRegistration(registration),
        getDeviceScale: () => this.getDeviceScale(),
        getOptions: () => this.optionsSnapshot,
        getViewportMode: () => this.viewportMode,
        isContextDestroyed: () => this.isDestroyed,
        onCaptured: (payload) => this.emitter.emit('backdropCaptured', payload),
        onError: (context) => this.emitter.emit('error', context),
        removeSource: (registration) => this.removeSource(registration),
        renderFrame: () => this.renderFrame(),
        requestComposite: (reason) => this.requestCompositeWithoutDomCapture(reason),
      },
    );
    this.canvasSources = new CanvasBackdropSourceController(
      this.sources,
      runtime,
      {
        assertRegistration: (registration) => this.assertRegistration(registration),
        requestComposite: (reason) => this.requestCompositeWithoutDomCapture(reason),
        sourceAdded: (registration) => this.domCapture.sourceAdded(registration),
        sourceRemoved: (registration) => this.domCapture.sourceRemoved(registration),
        sourceUpdated: (registration) => this.domCapture.sourceUpdated(registration),
      },
    );
    let renderer: WebGLRenderer | null = null;
    try {
      renderer = createContextRenderer(
        this.canvas,
        this.precision,
        runtime,
        this.optionsSnapshot,
        {
          onContextLost: () => this.handleRendererContextLost(),
          onContextRestored: () => this.handleRendererContextRestored(),
          onContextRestoreError: (error) => this.handleRendererRestoreError(error),
        },
      );
      this.fallback.setRendererUnavailable(renderer === null);
      this.renderer = renderer;
      this.presentation.setFallbackMode(this.fallbackMode);
      this.materials.setFallbackMode(this.fallbackMode);
      this.domCapture.setPaused(this.fallbackMode);
      container.appendChild(this.canvas);
      this.contextEvents = new ContextEventController(
        container,
        runtime,
        {
          onLayout: () => {
            this.domCapture.markAllDirty();
            this.refresh('layout');
          },
          onScroll: () => this.refresh('scroll'),
          onScrollPosition: () => this.presentation.syncScrollPosition(
            this.optionsSnapshot.scrollable ?? false,
          ),
          onBlurredChange: (blurred) => this.materials.setBlurred(blurred),
        },
        this.optionsSnapshot.enableBlurredEffect ?? false,
      );
    } catch (error) {
      renderer?.destroy();
      this.materials.destroy();
      this.domCapture.destroy();
      this.presentation.destroy();
      if (this.canvas.parentNode === container) {
        container.removeChild(this.canvas);
      }
      throw GlassError.fromUnknown(
        error,
        'LIFECYCLE_FAILED',
        'Failed to attach the liquid-glass presentation canvas.',
        { phase: 'lifecycle' },
      );
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
    if (config.kind === 'dom') {
      return this.domCapture.add(config);
    }
    return this.canvasSources.add(config);
  }

  /** Register a measurable material and return its lifecycle handle. */
  public addMaterial(config: MaterialConfig): MaterialHandle {
    return this.materials.add(config);
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
    const fallbackChanged = this.fallback.updateOptions(nextSnapshot);
    this.contextEvents.refreshTargets();
    this.contextEvents.setBlurredEffectEnabled(
      nextSnapshot.enableBlurredEffect ?? false,
    );
    this.domCapture.markAllDirty();
    this.presentation.update(nextSnapshot);
    if (fallbackChanged) {
      this.applyFallbackModeChange();
    }
    this.refresh('structural');
  }

  /** Create the delegation surface; external registration is deferred to P6. */
  public createProxyInterface(): ProxyInterface {
    this.assertUsable();
    return createContextProxyInterface(this.container, () => this.isDestroyed);
  }

  /** Force or release CSS fallback presentation. */
  public setFallbackMode(enabled: boolean): void {
    this.assertUsable();
    if (this.fallback.setForced(enabled)) {
      this.applyFallbackModeChange();
      this.refresh('fallback');
    }
  }

  /** Toggle viewport-limited mode; bounded capture is completed in P4. */
  public setViewportMode(enabled: boolean): void {
    this.assertUsable();
    if (this.viewportMode !== enabled) {
      this.viewportMode = enabled;
      this.domCapture.markAllDirty();
      this.emitter.emit('viewportModeChanged', enabled);
      this.refresh('viewport');
    }
  }

  /** Request capture, composition, and material rendering for one dirty reason. */
  public refresh(reason: TextureDirtyReason = 'external'): void {
    this.assertUsable();
    this.emitter.emit('compositeRequested', reason, 'high');
    if (this.fallbackMode) {
      this.renderFrame();
      return;
    }
    if (!this.domCapture.request(reason)) this.renderFrame();
  }

  private renderFrame(refreshBackdrop: boolean = true): void {
    try {
      const containerRect = this.container.getBoundingClientRect();
      const renderer = this.renderer;
      if (this.fallbackMode || !renderer) {
        const scale = this.getDeviceScale();
        const width = Math.max(1, Math.round(containerRect.width * scale));
        const height = Math.max(1, Math.round(containerRect.height * scale));
        const resized = this.canvas.width !== width || this.canvas.height !== height;
        if (this.canvas.width !== width) this.canvas.width = width;
        if (this.canvas.height !== height) this.canvas.height = height;
        if (this.sources.size > 0 && (refreshBackdrop || resized)) {
          this.backdropComposite.draw(containerRect, this.getDeviceScale());
        }
        this.emitRenderedFrame();
        return;
      }
      renderer.resize(containerRect.width, containerRect.height);
      if (this.sources.size === 0) {
        this.backdropTextureReady = false;
        renderer.clear();
        this.emitRenderedFrame();
        return;
      }
      if (refreshBackdrop || !this.backdropTextureReady) {
        this.backdropTextureReady = false;
        this.backdropComposite.draw(containerRect, this.getDeviceScale());
        renderer.uploadBackdrop(this.compositeCanvas);
        this.backdropTextureReady = true;
      }
      const materials = resolveRendererMaterials(
        this.materials.values(),
        this.container,
        containerRect,
        this.runtime,
      );
      renderer.render(materials);
      this.emitRenderedFrame();
    } catch (error) {
      const contextual = GlassError.fromUnknown(
        error,
        'RENDER_FAILED',
        'Failed to composite the liquid-glass context.',
        { phase: 'render' },
      );
      if (!this.domCapture.active) {
        this.emitter.emit('error', contextual.toContext());
      }
      throw contextual;
    }
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
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.contextEvents.destroy();
    this.domCapture.destroy();
    this.presentation.destroy();
    this.materials.destroy();
    for (const source of this.sources.values()) {
      source.destroyed = true;
    }
    this.sources.clear();
    this.renderer?.destroy();
    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas);
    }
    this.onDestroyed();
    this.emitter.emit('destroyed');
    this.emitter.removeAllListeners();
  }
  private applyFallbackModeChange(): void {
    const enabled = this.fallbackMode;
    if (!enabled && this.renderer) {
      this.renderFrame();
    }
    this.presentation.setFallbackMode(enabled);
    this.domCapture.setPaused(enabled);
    this.materials.setFallbackMode(enabled);
    this.emitter.emit('fallbackModeChanged', enabled);
  }

  private handleRendererContextLost(): void {
    if (!this.isDestroyed && this.fallback.setContextLost(true)) {
      this.applyFallbackModeChange();
      this.refresh('fallback');
    }
  }

  private handleRendererContextRestored(): void {
    if (this.isDestroyed) {
      return;
    }
    if (this.fallback.setContextLost(false)) {
      this.applyFallbackModeChange();
    }
    this.refresh('fallback');
  }

  private handleRendererRestoreError(error: GlassError): void {
    if (this.isDestroyed) return;
    this.emitter.emit('error', error.toContext());
  }

  private getDeviceScale(): number {
    const ratio = this.runtime.devicePixelRatio();
    const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    return safeRatio * this.precision;
  }

  private requestCompositeWithoutDomCapture(reason: TextureDirtyReason): void {
    this.emitter.emit('compositeRequested', reason, 'high');
    if (this.fallbackMode) {
      this.renderFrame();
      return;
    }
    if (!this.domCapture.requestComposite(reason)) this.renderFrame();
  }

  private removeSource(registration: BackdropRegistration): void {
    if (registration.destroyed) {
      return;
    }
    registration.destroyed = true;
    this.sources.delete(registration.id);
    this.domCapture.sourceRemoved(registration);
    if (!this.isDestroyed) {
      this.refresh('structural');
    }
  }

  private emitRenderedFrame(): void {
    const payload = { canvas: this.canvas };
    this.emitter.emit('materialsRendered', payload);
    this.emitter.emit('fullCanvasRendered', {
      ...payload,
      width: this.canvas.width,
      height: this.canvas.height,
    });
  }

  private assertRegistration(
    registration: BackdropRegistration | MaterialRegistration,
  ): void {
    this.assertUsable();
    if (registration.destroyed) {
      throw new GlassError(
        'LIFECYCLE_FAILED',
        'The registration has already been destroyed.',
        { phase: 'lifecycle' },
      );
    }
  }

  private assertUsable(): void {
    if (this.isDestroyed) {
      throw new GlassError(
        'DESTROYED_CONTEXT',
        'The liquid-glass context has already been destroyed.',
        { phase: 'lifecycle' },
      );
    }
  }
}
