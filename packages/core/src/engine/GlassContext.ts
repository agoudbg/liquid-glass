import { GlassError } from '../errors/GlassError';
import { TypedEventEmitter } from '../events/TypedEventEmitter';
import { type RendererMaterial, WebGLRenderer } from '../renderer';
import type {
  BackdropSourceChanges,
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
import { resolveRendererMaterial } from './material-resolver';
import {
  type CanvasBackdropRegistration,
  CanvasBackdropRegistrationHandle,
  type MaterialRegistration,
  MaterialRegistrationHandle,
} from './registrations';
import type { GlassEngineRuntime } from './runtime';

function resolvedPrecision(options: GlassContextOptions): number {
  const precision = options.renderPrecision;
  return precision === undefined || precision === 0 || !Number.isFinite(precision)
    ? 1
    : Math.max(0.05, precision);
}

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
  private readonly sources = new Map<string, CanvasBackdropRegistration>();
  private readonly materials = new Map<string, MaterialRegistration>();
  private readonly precision: number;
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
    private readonly options: GlassContextOptions,
    private readonly runtime: GlassEngineRuntime,
    private readonly onDestroyed: () => void,
  ) {
    this.precision = resolvedPrecision(options);
    this.canvas = runtime.createCanvas();
    this.compositeCanvas = runtime.createCanvas();
    this.configurePresentationCanvas();
    const renderer = new WebGLRenderer(this.canvas, {
      renderScale: this.precision,
      devicePixelRatio: runtime.devicePixelRatio,
      onContextRestored: () => {
        if (!this.isDestroyed) {
          this.refresh('external');
        }
      },
    });
    try {
      container.appendChild(this.canvas);
      this.renderer = renderer;
    } catch (error) {
      renderer.destroy();
      throw GlassError.fromUnknown(
        error,
        'LIFECYCLE_FAILED',
        'Failed to attach the liquid-glass presentation canvas.',
        { phase: 'lifecycle' },
      );
    }
  }

  /** Register a DOM source, currently deferred to P4. */
  public addBackdropSource(
    config: DomBackdropSourceConfig,
  ): BackdropSourceHandle<DomBackdropSourceConfig>;

  /** Register a core-owned custom canvas source. */
  public addBackdropSource(
    config: CanvasBackdropSourceConfig,
  ): BackdropSourceHandle<CanvasBackdropSourceConfig>;

  /** Register a backdrop source supported by the current implementation phase. */
  public addBackdropSource(
    config: BackdropSourceConfig,
  ): BackdropSourceHandle {
    this.assertUsable();
    if (config.kind === 'dom') {
      throw new GlassError(
        'CAPTURE_FAILED',
        'DOM backdrop capture is introduced in rewrite phase P4.',
        { phase: 'capture' },
      );
    }

    const registration: CanvasBackdropRegistration = {
      id: generateUUID(),
      config: { ...config },
      canvas: this.runtime.createCanvas(),
      destroyed: false,
    };
    this.sources.set(registration.id, registration);
    const handle = new CanvasBackdropRegistrationHandle(registration, {
      update: (changes) => this.updateSource(registration, changes),
      refresh: () => this.refreshSource(registration),
      destroy: () => this.removeSource(registration),
    });
    try {
      this.refresh('structural');
      return handle;
    } catch (error) {
      registration.destroyed = true;
      this.sources.delete(registration.id);
      throw error;
    }
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
      this.emitter.emit('viewportModeChanged', enabled);
    }
  }

  /** Synchronously redraw custom sources, upload, and render all materials. */
  public refresh(reason: TextureDirtyReason = 'external'): void {
    this.assertUsable();
    this.emitter.emit('compositeRequested', reason, 'high');

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
      const materials = this.resolveMaterials(containerRect);
      this.renderer.render(materials);
      this.emitRenderedFrame();
    } catch (error) {
      const contextual = GlassError.fromUnknown(
        error,
        'RENDER_FAILED',
        'Failed to composite the liquid-glass context.',
        { phase: 'render' },
      );
      this.emitter.emit('error', contextual.toContext());
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

  private configurePresentationCanvas(): void {
    this.canvas.className = 'liquid-glass-canvas';
    this.canvas.dataset.liquidGlassCanvas = 'uniform';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = String(this.options.canvasZIndex ?? 9_999);
  }

  private drawBackdropComposite(containerRect: DOMRectReadOnly): void {
    this.compositeCanvas.width = this.canvas.width;
    this.compositeCanvas.height = this.canvas.height;
    const compositeContext = this.compositeCanvas.getContext('2d');
    if (!compositeContext) {
      throw new GlassError(
        'CAPTURE_FAILED',
        'Unable to allocate the custom-backdrop composite context.',
        { phase: 'capture' },
      );
    }
    compositeContext.clearRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);
    const ratio = this.runtime.devicePixelRatio();
    const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    const deviceScale = safeRatio * this.precision;
    const orderedSources = [...this.sources.values()].sort(
      (left, right) => (left.config.zIndex ?? 0) - (right.config.zIndex ?? 0),
    );

    for (const source of orderedSources) {
      const sourceRect = source.config.element.getBoundingClientRect();
      const configuredScale = source.config.scale ?? 1;
      const sourceScale = Number.isFinite(configuredScale) && configuredScale > 0
        ? configuredScale
        : 1;
      source.canvas.width = Math.max(1, Math.round(sourceRect.width * deviceScale * sourceScale));
      source.canvas.height = Math.max(1, Math.round(sourceRect.height * deviceScale * sourceScale));
      const sourceContext = source.canvas.getContext('2d');
      if (!sourceContext) {
        throw new GlassError(
          'CAPTURE_FAILED',
          'Unable to allocate a custom-backdrop drawing context.',
          { phase: 'capture', backdropId: source.id },
        );
      }
      sourceContext.setTransform(1, 0, 0, 1, 0, 0);
      sourceContext.clearRect(0, 0, source.canvas.width, source.canvas.height);
      sourceContext.setTransform(deviceScale * sourceScale, 0, 0, deviceScale * sourceScale, 0, 0);
      try {
        source.config.draw(sourceContext, sourceRect.width, sourceRect.height);
      } finally {
        sourceContext.setTransform(1, 0, 0, 1, 0, 0);
      }
      const destinationX = (sourceRect.left - containerRect.left) * deviceScale;
      const destinationY = (sourceRect.top - containerRect.top) * deviceScale;
      const destinationWidth = sourceRect.width * deviceScale;
      const destinationHeight = sourceRect.height * deviceScale;
      compositeContext.drawImage(
        source.canvas,
        destinationX,
        destinationY,
        destinationWidth,
        destinationHeight,
      );
      this.emitter.emit('backdropCaptured', {
        id: source.id,
        canvas: source.canvas,
        width: source.canvas.width,
        height: source.canvas.height,
      });
    }
  }

  private resolveMaterials(containerRect: DOMRectReadOnly): RendererMaterial[] {
    return [...this.materials.values()]
      .sort((left, right) => (
        (left.config.renderOrder ?? 0) - (right.config.renderOrder ?? 0)
      ))
      .map((registration) => resolveRendererMaterial(
        registration.id,
        registration.config,
        this.container,
        containerRect,
        this.runtime,
      ))
      .filter((material): material is RendererMaterial => material !== null);
  }

  private updateSource(
    registration: CanvasBackdropRegistration,
    changes: BackdropSourceChanges<CanvasBackdropSourceConfig>,
  ): void {
    this.assertRegistration(registration);
    registration.config = { ...registration.config, ...changes };
    this.refresh('external');
  }

  private refreshSource(registration: CanvasBackdropRegistration): void {
    this.assertRegistration(registration);
    this.refresh('external');
  }

  private removeSource(registration: CanvasBackdropRegistration): void {
    if (registration.destroyed) {
      return;
    }
    registration.destroyed = true;
    this.sources.delete(registration.id);
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
    registration: CanvasBackdropRegistration | MaterialRegistration,
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
