import { DirtyFrameScheduler } from '../backdrop/DirtyFrameScheduler';
import {
  captureDomElement,
  type DomCaptureResult,
} from '../backdrop/dom-capture';
import { calculateViewportCaptureRect } from '../backdrop/viewport';
import { GlassError, type GlassErrorContext } from '../errors/GlassError';
import type { RectLike } from '../types/common';
import type {
  BackdropSourceChanges,
  BackdropSourceHandle,
  DomBackdropSourceConfig,
  GlassContextOptions,
  TextureDirtyReason,
  ViewportCaptureConfig,
} from '../types/context';
import type { BackdropCapturedPayload } from '../types/events';
import { generateUUID } from '../utils/uuid';
import type {
  BackdropRegistration,
  DomBackdropRegistration,
} from './registrations';
import {
  DomBackdropRegistrationHandle,
  isDomBackdropRegistration,
} from './registrations';
import type { GlassEngineRuntime } from './runtime';

/** Context callbacks required by the DOM capture controller. */
export interface DomBackdropCaptureCallbacks {
  /** Assert that a handle still belongs to a usable context. */
  assertRegistration(registration: DomBackdropRegistration): void;
  /** Read the effective device scale for the next capture. */
  getDeviceScale(): number;
  /** Read the current context options without copying them. */
  getOptions(): GlassContextOptions;
  /** Read the current global viewport-capture override. */
  getViewportMode(): boolean;
  /** Report whether the owning context has been destroyed. */
  isContextDestroyed(): boolean;
  /** Emit metadata after a source is captured successfully. */
  onCaptured(payload: BackdropCapturedPayload): void;
  /** Surface an asynchronous capture or render failure. */
  onError(context: GlassErrorContext): void;
  /** Remove a source through the context-owned lifecycle path. */
  removeSource(registration: DomBackdropRegistration): void;
  /** Render one frame after all dirty captures have settled. */
  renderFrame(): void;
  /** Request a composite without invalidating unrelated DOM sources. */
  requestComposite(reason: TextureDirtyReason): void;
}

/**
 * Own DOM backdrop registration, invalidation, and serialized rasterization.
 *
 * The context retains composition and event ownership. This controller only
 * decides when cached DOM bitmaps must be replaced and rejects stale results.
 */
export class DomBackdropCaptureController {
  private scheduler: DirtyFrameScheduler | null = null;
  private schedulerGeneration = 0;

  /** Whether this controller currently owns an active DOM frame scheduler. */
  public get active(): boolean {
    return this.scheduler !== null;
  }

  /** Create a controller around one context's shared source registry. */
  public constructor(
    private readonly container: HTMLElement,
    private readonly sources: Map<string, BackdropRegistration>,
    private readonly runtime: GlassEngineRuntime,
    private readonly callbacks: DomBackdropCaptureCallbacks,
  ) {}

  /** Register a DOM source and return its stable public handle. */
  public add(
    config: DomBackdropSourceConfig,
  ): BackdropSourceHandle<DomBackdropSourceConfig> {
    const registration: DomBackdropRegistration = {
      id: generateUUID(),
      config: { ...config },
      canvas: null,
      viewportRect: null,
      dirty: true,
      captureVersion: 0,
      destroyed: false,
    };
    this.sources.set(registration.id, registration);
    const handle = new DomBackdropRegistrationHandle(registration, {
      update: (changes) => this.update(registration, changes),
      refresh: () => this.refresh(registration),
      destroy: () => this.callbacks.removeSource(registration),
    });
    try {
      this.ensureScheduler();
      this.callbacks.requestComposite('structural');
      return handle;
    } catch (error) {
      registration.destroyed = true;
      this.sources.delete(registration.id);
      this.sourceRemoved();
      throw error;
    }
  }

  /** Mark every DOM source stale, preserving its last usable bitmap. */
  public markAllDirty(): void {
    for (const source of this.sources.values()) {
      if (isDomBackdropRegistration(source)) {
        this.invalidate(source);
      }
    }
  }

  /** Schedule capture-aware work, returning false when no DOM scheduler exists. */
  public request(reason: TextureDirtyReason): boolean {
    if (!this.scheduler) {
      return false;
    }
    this.markDirtyForReason(reason);
    this.scheduler.request(reason);
    return true;
  }

  /** Schedule a composite that reuses all currently valid DOM bitmaps. */
  public requestComposite(reason: TextureDirtyReason): boolean {
    if (!this.scheduler) {
      return false;
    }
    this.scheduler.request(reason);
    return true;
  }

  /** Tear down scheduling after a DOM registration leaves the source map. */
  public sourceRemoved(): void {
    if (this.hasDomSources() || !this.scheduler) {
      return;
    }
    this.retireScheduler();
  }

  /** Cancel all pending controller work. */
  public destroy(): void {
    this.retireScheduler();
  }

  private update(
    registration: DomBackdropRegistration,
    changes: BackdropSourceChanges<DomBackdropSourceConfig>,
  ): void {
    this.callbacks.assertRegistration(registration);
    registration.config = { ...registration.config, ...changes };
    this.invalidate(registration);
    this.callbacks.requestComposite('external');
  }

  private refresh(registration: DomBackdropRegistration): void {
    this.callbacks.assertRegistration(registration);
    this.invalidate(registration);
    this.callbacks.requestComposite('external');
  }

  private ensureScheduler(): void {
    if (this.scheduler) {
      return;
    }
    const requestFrame = this.runtime.requestAnimationFrame
      ?? (
        typeof globalThis.requestAnimationFrame === 'function'
          ? globalThis.requestAnimationFrame.bind(globalThis)
          : null
      );
    const cancelFrame = this.runtime.cancelAnimationFrame
      ?? (
        typeof globalThis.cancelAnimationFrame === 'function'
          ? globalThis.cancelAnimationFrame.bind(globalThis)
          : null
      );
    if (!requestFrame || !cancelFrame) {
      throw new GlassError(
        'LIFECYCLE_FAILED',
        'Animation frame APIs are required for DOM backdrop capture.',
        { phase: 'lifecycle' },
      );
    }

    const generation = this.schedulerGeneration + 1;
    this.schedulerGeneration = generation;
    this.scheduler = new DirtyFrameScheduler(
      {
        cancelAnimationFrame: (handle) => cancelFrame(handle),
        requestAnimationFrame: (callback) => requestFrame(callback),
      },
      async () => {
        await this.captureDirtySources(generation);
        if (this.isGenerationActive(generation)) {
          this.callbacks.renderFrame();
        }
      },
      (error) => {
        if (this.isGenerationActive(generation)) {
          this.reportScheduledError(error);
        }
      },
    );
  }

  private async captureDirtySources(generation: number): Promise<void> {
    const capture = this.runtime.captureDomElement ?? captureDomElement;
    const containerRect = this.container.getBoundingClientRect();
    const viewportRect = this.getCaptureViewport(containerRect);
    const deviceScale = this.callbacks.getDeviceScale();
    const sources = [...this.sources.values()].filter(isDomBackdropRegistration);

    for (const source of sources) {
      if (!this.isGenerationActive(generation)) {
        return;
      }
      if (source.destroyed || !source.dirty) {
        continue;
      }
      const sourceRect = source.config.element.getBoundingClientRect();
      const fullSize = {
        width: Math.max(source.config.element.scrollWidth, sourceRect.width),
        height: Math.max(source.config.element.scrollHeight, sourceRect.height),
      };
      const capturePolicy = this.resolveViewportPolicy(source.config);
      const boundedRect = capturePolicy === false
        ? null
        : calculateViewportCaptureRect(
            sourceRect,
            fullSize,
            viewportRect,
            capturePolicy,
          );

      if (capturePolicy !== false && boundedRect === null) {
        source.canvas = null;
        source.viewportRect = null;
        source.dirty = false;
        continue;
      }

      const configuredScale = source.config.scale ?? 1;
      const sourceScale = Number.isFinite(configuredScale) && configuredScale > 0
        ? configuredScale
        : 1;
      const captureVersion = source.captureVersion;
      let result: DomCaptureResult;
      try {
        result = await capture({
          backdropId: source.id,
          backgroundColor: source.config.backgroundColor,
          captureRect: boundedRect,
          element: source.config.element,
          library: source.config.captureLibrary ?? 'html-to-image',
          pixelRatio: deviceScale * sourceScale,
          timeoutMs: 5_000,
        });
      } catch (error) {
        if (this.isGenerationActive(generation) && !source.destroyed) {
          this.reportSourceError(error, source.id);
        }
        continue;
      }
      if (!this.isGenerationActive(generation) || source.destroyed) {
        continue;
      }
      if (source.captureVersion !== captureVersion) {
        continue;
      }
      source.canvas = result.canvas;
      source.viewportRect = result.viewportRect;
      source.dirty = false;
      this.callbacks.onCaptured({
        id: source.id,
        canvas: result.canvas,
        width: result.canvas.width,
        height: result.canvas.height,
      });
    }
  }

  private getCaptureViewport(containerRect: DOMRectReadOnly): RectLike {
    if (this.callbacks.getOptions().scrollable) {
      return containerRect;
    }
    if (this.runtime.getViewportRect) {
      return this.runtime.getViewportRect();
    }
    const width = typeof globalThis.innerWidth === 'number'
      ? globalThis.innerWidth
      : containerRect.width;
    const height = typeof globalThis.innerHeight === 'number'
      ? globalThis.innerHeight
      : containerRect.height;
    return { x: 0, y: 0, width, height };
  }

  private resolveViewportPolicy(
    config: DomBackdropSourceConfig,
  ): boolean | ViewportCaptureConfig {
    if (!this.callbacks.getViewportMode()) {
      return config.viewportCapture ?? false;
    }
    if (
      typeof config.viewportCapture === 'object'
      && config.viewportCapture !== null
    ) {
      return { ...config.viewportCapture, enabled: true };
    }
    return true;
  }

  private markDirtyForReason(reason: TextureDirtyReason): void {
    if (
      reason !== 'external'
      && reason !== 'viewport'
      && reason !== 'fallback'
      && reason !== 'unknown'
      && reason !== 'scroll'
    ) {
      return;
    }
    for (const source of this.sources.values()) {
      if (!isDomBackdropRegistration(source)) {
        continue;
      }
      if (reason !== 'scroll' || this.resolveViewportPolicy(source.config) !== false) {
        this.invalidate(source);
      }
    }
  }

  private hasDomSources(): boolean {
    return [...this.sources.values()].some(isDomBackdropRegistration);
  }

  private invalidate(registration: DomBackdropRegistration): void {
    registration.dirty = true;
    registration.captureVersion += 1;
  }

  private isGenerationActive(generation: number): boolean {
    return !this.callbacks.isContextDestroyed()
      && this.scheduler !== null
      && this.schedulerGeneration === generation;
  }

  private retireScheduler(): void {
    this.schedulerGeneration += 1;
    this.scheduler?.destroy();
    this.scheduler = null;
  }

  private reportSourceError(error: unknown, backdropId: string): void {
    const contextual = GlassError.fromUnknown(
      error,
      'CAPTURE_FAILED',
      'Failed to capture a DOM backdrop source.',
      { phase: 'capture', backdropId },
    );
    this.callbacks.onError(contextual.toContext());
  }

  private reportScheduledError(error: unknown): void {
    if (this.callbacks.isContextDestroyed()) {
      return;
    }
    const contextual = GlassError.fromUnknown(
      error,
      'CAPTURE_FAILED',
      'Failed to capture and composite the DOM backdrop.',
      { phase: 'capture' },
    );
    this.callbacks.onError(contextual.toContext());
  }
}
