import { raceWithAbort } from '../backdrop/abort';
import { DirtyFrameScheduler } from '../backdrop/DirtyFrameScheduler';
import {
  captureDomElement,
  type DomCaptureResult,
} from '../backdrop/dom-capture';
import { calculateViewportCaptureRect } from '../backdrop/viewport';
import { GlassError, type GlassErrorContext } from '../errors/GlassError';
import type {
  BackdropSourceChanges,
  BackdropSourceHandle,
  DomBackdropSourceConfig,
  GlassContextOptions,
  TextureDirtyReason,
} from '../types/context';
import type { BackdropCapturedPayload } from '../types/events';
import {
  rethrowAfterRunningTasks,
  runTasksPreservingFirstFailure,
} from '../utils/run-tasks';
import { generateUUID } from '../utils/uuid';
import {
  prepareDomBackdropSourceUpdate,
  snapshotDomBackdropSourceConfig,
} from './backdrop-config';
import {
  needsViewportRecapture,
  resolveCaptureViewport,
  resolveViewportPolicy,
} from './capture-viewport-policy';
import {
  type DomCaptureDiagnosticsState,
  readDiagnosticsTimestamp,
  resolveDiagnosticsDuration,
} from './diagnostics-internal';
import {
  createBackdropSourceCaptureError,
  createScheduledCaptureError,
} from './dom-capture-errors';
import type {
  BackdropRegistration,
  DomBackdropRegistration,
} from './registrations';
import {
  DomBackdropRegistrationHandle,
  isDomBackdropRegistration,
} from './registrations';
import type { GlassEngineRuntime } from './runtime';
import { SourceObserverRegistry } from './SourceObserverRegistry';

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
  onCaptured(payload: BackdropCapturedPayload, durationMs: number | null): void;
  /** Report whether optional capture measurements are enabled. */
  isDiagnosticsEnabled?(): boolean;
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
  private readonly observers: SourceObserverRegistry;
  private readonly activeCaptureGenerations = new Set<number>();
  private captureAbortController: AbortController | null = null;
  private paused = false;
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
  ) {
    this.observers = new SourceObserverRegistry(
      runtime,
      (registration, reason, recapture) => (
        this.handleObservedInvalidation(registration, reason, recapture)
      ),
    );
  }

  /** Register a DOM source and return its stable public handle. */
  public add(
    config: DomBackdropSourceConfig,
  ): BackdropSourceHandle<DomBackdropSourceConfig> {
    const registration: DomBackdropRegistration = {
      id: generateUUID(),
      config: snapshotDomBackdropSourceConfig(config),
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
      if (!this.paused) {
        this.ensureScheduler();
      }
      this.sourceAdded(registration);
      this.callbacks.requestComposite('structural');
      return handle;
    } catch (error) {
      rethrowAfterRunningTasks(error, [
        () => {
          registration.destroyed = true;
          this.sources.delete(registration.id);
        },
        () => this.sourceRemoved(registration),
      ]);
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
    if (this.paused) {
      return true;
    }
    if (!this.scheduler) {
      return false;
    }
    this.markDirtyForReason(reason);
    this.scheduler.request(reason);
    return true;
  }

  /** Schedule a composite that reuses all currently valid DOM bitmaps. */
  public requestComposite(reason: TextureDirtyReason): boolean {
    if (this.paused) {
      return true;
    }
    if (!this.scheduler) {
      return false;
    }
    this.scheduler.request(reason);
    return true;
  }

  /** Attach automatic resize and position observation for any backdrop source. */
  public sourceAdded(registration: BackdropRegistration): void {
    this.observers.track(registration);
  }

  /** Rebind automatic observation after a backdrop configuration update. */
  public sourceUpdated(registration: BackdropRegistration): void {
    this.observers.update(registration);
  }

  /** Tear down observation and DOM capture work after a source leaves the map. */
  public sourceRemoved(registration: BackdropRegistration): void {
    runTasksPreservingFirstFailure([
      () => this.observers.untrack(registration),
      () => {
        if (!isDomBackdropRegistration(registration) || !this.scheduler) return;
        if (!this.hasDomSources()) {
          this.retireScheduler();
          return;
        }
        this.restartSchedulerIfCapturing();
      },
    ]);
  }

  /** Suspend rasterization while retaining observers and dirty source state. */
  public setPaused(paused: boolean): void {
    if (this.paused === paused) {
      return;
    }
    this.paused = paused;
    if (paused) {
      this.retireScheduler();
      return;
    }
    if (this.hasDomSources()) {
      this.ensureScheduler();
    }
  }

  /** Cancel all pending controller work. */
  public destroy(): void {
    runTasksPreservingFirstFailure([
      () => this.observers.destroy(),
      () => this.retireScheduler(),
    ]);
  }

  /** Return capture scheduling and observer state for diagnostics. */
  public getDiagnosticsState(): DomCaptureDiagnosticsState {
    const scheduler = this.scheduler?.getState();
    return {
      active: this.scheduler !== null,
      activeTasks: this.activeCaptureGenerations.size,
      pendingFrame: scheduler?.pendingFrame ?? false,
      running: scheduler?.running ?? false,
      resources: this.observers.getDiagnosticsState(),
    };
  }

  private update(
    registration: DomBackdropRegistration,
    changes: BackdropSourceChanges<DomBackdropSourceConfig>,
  ): void {
    this.callbacks.assertRegistration(registration);
    const prepared = prepareDomBackdropSourceUpdate(registration.config, changes);
    if (!prepared) return;
    const previousConfig = registration.config;
    registration.config = prepared.next;
    try {
      this.sourceUpdated(registration);
    } catch (error) {
      registration.config = previousConfig;
      rethrowAfterRunningTasks(error, [() => this.sourceUpdated(registration)]);
    }
    this.invalidate(registration);
    this.callbacks.requestComposite('external');
  }

  private refresh(registration: DomBackdropRegistration): void {
    this.callbacks.assertRegistration(registration);
    this.invalidate(registration);
    this.callbacks.requestComposite('external');
  }

  private ensureScheduler(): void {
    if (this.paused || this.scheduler) {
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
        const abortController = new AbortController();
        this.captureAbortController = abortController;
        this.activeCaptureGenerations.add(generation);
        try {
          await this.captureDirtySources(generation, abortController.signal);
          if (this.isGenerationActive(generation)) {
            this.callbacks.renderFrame();
          }
        } finally {
          this.activeCaptureGenerations.delete(generation);
          if (this.captureAbortController === abortController) {
            this.captureAbortController = null;
          }
        }
      },
      (error) => {
        if (this.isGenerationActive(generation)) {
          this.callbacks.onError(createScheduledCaptureError(error));
        }
      },
    );
  }

  private async captureDirtySources(
    generation: number,
    signal: AbortSignal,
  ): Promise<void> {
    const capture = this.runtime.captureDomElement ?? captureDomElement;
    const containerRect = this.container.getBoundingClientRect();
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
      const viewportRect = resolveCaptureViewport(
        containerRect,
        source.config.element,
        this.callbacks.getOptions().scrollable ?? false,
        this.runtime,
      );
      const fullSize = {
        width: Math.max(source.config.element.scrollWidth, sourceRect.width),
        height: Math.max(source.config.element.scrollHeight, sourceRect.height),
      };
      const capturePolicy = resolveViewportPolicy(
        source.config,
        this.callbacks.getViewportMode(),
      );
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
      const startedAt = (this.callbacks.isDiagnosticsEnabled?.() ?? false)
        ? readDiagnosticsTimestamp(this.runtime)
        : null;
      let result: DomCaptureResult;
      try {
        result = await raceWithAbort(
          capture({
            backdropId: source.id,
            backgroundColor: source.config.backgroundColor,
            captureRect: boundedRect,
            element: source.config.element,
            library: source.config.captureLibrary ?? 'html-to-image',
            pixelRatio: deviceScale * sourceScale,
            signal,
            timeoutMs: 5_000,
          }),
          signal,
        );
      } catch (error) {
        if (this.isGenerationActive(generation) && !source.destroyed) {
          this.callbacks.onError(createBackdropSourceCaptureError(
            error,
            source.id,
          ));
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
      const durationMs = startedAt === null ? null : resolveDiagnosticsDuration(
        startedAt,
        readDiagnosticsTimestamp(this.runtime),
      );
      this.callbacks.onCaptured(
        {
          id: source.id,
          canvas: result.canvas,
          width: result.canvas.width,
          height: result.canvas.height,
          viewportRect: { ...result.viewportRect },
        },
        durationMs,
      );
    }
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
      if (reason !== 'scroll' || this.shouldInvalidateOnScroll(source)) {
        this.invalidate(source);
      }
    }
  }

  private shouldInvalidateOnScroll(source: DomBackdropRegistration): boolean {
    return needsViewportRecapture(
      source,
      this.container.getBoundingClientRect(),
      this.callbacks.getViewportMode(),
      this.callbacks.getOptions().scrollable ?? false,
      this.runtime,
    );
  }

  private hasDomSources(): boolean {
    return [...this.sources.values()].some(isDomBackdropRegistration);
  }

  private invalidate(registration: DomBackdropRegistration): void {
    registration.dirty = true;
    registration.captureVersion += 1;
    this.restartSchedulerIfCapturing();
  }

  private handleObservedInvalidation(
    registration: BackdropRegistration,
    reason: TextureDirtyReason,
    recapture: boolean,
  ): void {
    if (registration.destroyed || !this.sources.has(registration.id)) {
      return;
    }
    if (isDomBackdropRegistration(registration)) {
      if (recapture || this.shouldInvalidateOnScroll(registration)) {
        this.invalidate(registration);
      }
    } else if (recapture) {
      registration.dirty = true;
    }
    this.callbacks.requestComposite(reason);
  }

  private restartSchedulerIfCapturing(): void {
    if (!this.captureAbortController) {
      return;
    }
    this.retireScheduler();
    if (!this.paused && this.hasDomSources()) {
      this.ensureScheduler();
    }
  }

  private isGenerationActive(generation: number): boolean {
    return !this.callbacks.isContextDestroyed()
      && this.scheduler !== null
      && this.schedulerGeneration === generation;
  }

  private retireScheduler(): void {
    const retiredGeneration = this.schedulerGeneration;
    this.schedulerGeneration += 1;
    this.activeCaptureGenerations.delete(retiredGeneration);
    const abortController = this.captureAbortController;
    this.captureAbortController = null;
    const scheduler = this.scheduler;
    this.scheduler = null;
    runTasksPreservingFirstFailure([
      () => abortController?.abort(),
      () => scheduler?.destroy(),
    ]);
  }

}
