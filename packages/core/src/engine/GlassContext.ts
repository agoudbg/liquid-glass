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
  MaterialChanges,
  MaterialConfig,
  MaterialHandle,
  TextureDirtyReason,
} from '../types/context';
import type { GlassEventMap } from '../types/events';
import type { ProxyInterface } from '../types/external-material';
import type { InteractionState } from '../types/interaction';
import { generateUUID } from '../utils/uuid';
import { drawBackdropComposite } from './canvas-backdrop';
import { CanvasBackdropSourceController } from './CanvasBackdropSourceController';
import {
  resolveContextPrecision,
  snapshotContextOptions,
} from './context-options';
import { ContextPresentation } from './context-presentation';
import { ContextEventController } from './ContextEventController';
import { DomBackdropCaptureController } from './DomBackdropCaptureController';
import { resolveRendererMaterials } from './material-resolver';
import {
  type BackdropRegistration,
  type MaterialRegistration,
  MaterialRegistrationHandle,
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

  private readonly renderer: WebGLRenderer;
  private readonly compositeCanvas: HTMLCanvasElement;
  private readonly emitter = new TypedEventEmitter<GlassEventMap>();
  private readonly sources = new Map<string, BackdropRegistration>();
  private readonly materials = new Map<string, MaterialRegistration>();
  private readonly canvasSources: CanvasBackdropSourceController;
  private readonly domCapture: DomBackdropCaptureController;
  private readonly contextEvents: ContextEventController;
  private readonly presentation: ContextPresentation;
  private optionsSnapshot: GlassContextOptions;
  private precision: number;
  private isDestroyed = false;
  private fallbackMode = false;
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
    private readonly container: HTMLElement,
    options: GlassContextOptions,
    private readonly runtime: GlassEngineRuntime,
    private readonly onDestroyed: () => void,
  ) {
    this.optionsSnapshot = snapshotContextOptions(options);
    this.precision = resolveContextPrecision(this.optionsSnapshot);
    this.canvas = runtime.createCanvas();
    this.compositeCanvas = runtime.createCanvas();
    this.presentation = new ContextPresentation(
      container,
      this.canvas,
      this.optionsSnapshot,
    );
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
      renderer = new WebGLRenderer(this.canvas, {
        renderScale: this.precision,
        devicePixelRatio: runtime.devicePixelRatio,
        onContextRestored: () => {
          if (!this.isDestroyed) {
            this.refresh('external');
          }
        },
      });
      container.appendChild(this.canvas);
      this.renderer = renderer;
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
        },
      );
    } catch (error) {
      renderer?.destroy();
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
      return this.addDomBackdropSource(config);
    }
    return this.canvasSources.add(config);
  }

  private addDomBackdropSource(
    config: DomBackdropSourceConfig,
  ): BackdropSourceHandle<DomBackdropSourceConfig> {
    return this.domCapture.add(config);
  }

  /** Register a measurable material and return its lifecycle handle. */
  public addMaterial(config: MaterialConfig): MaterialHandle {
    this.assertUsable();
    const registration: MaterialRegistration = {
      id: generateUUID(),
      config: { ...config },
      interactionState: null,
      destroyed: false,
    };
    this.materials.set(registration.id, registration);
    this.emitter.emit('materialAdded', registration.id, registration.config);

    const handle = new MaterialRegistrationHandle(registration, {
      update: (changes) => this.updateMaterial(registration, changes),
      setInteractionState: (state) => this.setMaterialInteraction(registration, state),
      refreshLayout: () => this.refreshMaterial(registration),
      destroy: () => this.removeMaterial(registration),
    });
    try {
      this.refresh('structural');
      return handle;
    } catch (error) {
      registration.destroyed = true;
      this.materials.delete(registration.id);
      this.emitter.emit('materialRemoved', registration.id);
      throw error;
    }
  }

  /** Replace context options in place and synchronously apply presentation changes. */
  public updateOptions(options: GlassContextOptions): void {
    this.assertUsable();
    const nextSnapshot = snapshotContextOptions(options);
    const nextPrecision = resolveContextPrecision(nextSnapshot);

    this.renderer.setRenderScale(nextPrecision);
    this.optionsSnapshot = nextSnapshot;
    this.precision = nextPrecision;
    this.contextEvents.refreshTargets();
    this.domCapture.markAllDirty();
    this.presentation.update(nextSnapshot);
    this.refresh('structural');
  }

  /** Create the delegation surface; external registration is deferred to P6. */
  public createProxyInterface(): ProxyInterface {
    this.assertUsable();
    return {
      registerExternalMaterial: () => {
        throw new GlassError(
          'INVALID_CONFIG',
          'External material delegation is introduced in rewrite phase P6.',
          { phase: 'configuration' },
        );
      },
      getContainerRect: () => (
        this.isDestroyed ? null : this.container.getBoundingClientRect()
      ),
      getScrollPosition: () => ({
        x: this.container.scrollLeft,
        y: this.container.scrollTop,
      }),
    };
  }

  /** Toggle the fallback flag; CSS fallback rendering is completed in P4. */
  public setFallbackMode(enabled: boolean): void {
    this.assertUsable();
    if (this.fallbackMode !== enabled) {
      this.fallbackMode = enabled;
      this.emitter.emit('fallbackModeChanged', enabled);
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
    if (this.domCapture.request(reason)) {
      return;
    }
    this.renderFrame();
  }

  private renderFrame(): void {
    try {
      const containerRect = this.container.getBoundingClientRect();
      this.renderer.resize(containerRect.width, containerRect.height);
      if (this.sources.size === 0) {
        this.renderer.clear();
        this.emitRenderedFrame();
        return;
      }
      this.drawBackdropComposite(containerRect);
      this.renderer.uploadBackdrop(this.compositeCanvas);
      const materials = resolveRendererMaterials(
        this.materials.values(),
        this.container,
        containerRect,
        this.runtime,
      );
      this.renderer.render(materials);
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
    for (const source of this.sources.values()) {
      source.destroyed = true;
    }
    for (const material of this.materials.values()) {
      material.destroyed = true;
    }
    this.sources.clear();
    this.materials.clear();
    this.renderer.destroy();
    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas);
    }
    this.onDestroyed();
    this.emitter.emit('destroyed');
    this.emitter.removeAllListeners();
  }

  private drawBackdropComposite(containerRect: DOMRectReadOnly): void {
    const deviceScale = this.getDeviceScale();
    const captures = drawBackdropComposite(
      this.compositeCanvas,
      this.canvas.width,
      this.canvas.height,
      this.sources.values(),
      containerRect,
      deviceScale,
    );

    for (const capture of captures) {
      this.emitter.emit('backdropCaptured', {
        id: capture.id,
        canvas: capture.canvas,
        width: capture.width,
        height: capture.height,
      });
    }
  }

  private getDeviceScale(): number {
    const ratio = this.runtime.devicePixelRatio();
    const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    return safeRatio * this.precision;
  }

  private requestCompositeWithoutDomCapture(reason: TextureDirtyReason): void {
    this.emitter.emit('compositeRequested', reason, 'high');
    if (this.domCapture.requestComposite(reason)) {
      return;
    }
    this.renderFrame();
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

  private updateMaterial(
    registration: MaterialRegistration,
    changes: MaterialChanges,
  ): void {
    this.assertRegistration(registration);
    registration.config = { ...registration.config, ...changes };
    this.emitter.emit('materialUpdated', registration.id, changes);
    this.refresh('material_interaction');
  }

  private setMaterialInteraction(
    registration: MaterialRegistration,
    state: InteractionState,
  ): void {
    this.assertRegistration(registration);
    registration.interactionState = state;
    this.refresh('material_interaction');
  }

  private refreshMaterial(registration: MaterialRegistration): void {
    this.assertRegistration(registration);
    this.refresh('layout');
  }

  private removeMaterial(registration: MaterialRegistration): void {
    if (registration.destroyed) {
      return;
    }
    registration.destroyed = true;
    this.materials.delete(registration.id);
    this.emitter.emit('materialRemoved', registration.id);
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
