import type { WebGLRenderer } from '../renderer';
import type {
  DiagnosticsMetricsSnapshot,
  DiagnosticsSnapshot,
  DiagnosticsWebGLResourceCounts,
  GlassContextOptions,
} from '../types';
import type { ContextEventController } from './ContextEventController';
import type { ContextRenderCoordinator } from './ContextRenderCoordinator';
import { readDiagnosticsTimestamp } from './diagnostics-internal';
import type { DomBackdropCaptureController } from './DomBackdropCaptureController';
import type {
  FallbackController,
  FallbackStateSnapshot,
} from './FallbackController';
import type { MaterialPresentationController } from './MaterialPresentationController';
import {
  type BackdropRegistration,
  isCanvasBackdropRegistration,
  isDomBackdropRegistration,
} from './registrations';
import type { GlassEngineRuntime } from './runtime';

const EMPTY_WEBGL_RESOURCES: DiagnosticsWebGLResourceCounts = {
  shaders: 0,
  programs: 0,
  buffers: 0,
  vertexArrays: 0,
  textures: 0,
};

/** Mutable context-level values sampled by the internal diagnostics owner. */
export interface ContextDiagnosticsState {
  debugEnabled: boolean;
  destroyed: boolean;
  destroying: boolean;
  options: GlassContextOptions;
  precision: number;
  viewportMode: boolean;
}

/** Owners read by the diagnostics controller without exposing them publicly. */
export interface ContextDiagnosticsOwners {
  readonly contextEvents: ContextEventController;
  readonly domCapture: DomBackdropCaptureController;
  readonly fallback: FallbackController;
  readonly materials: MaterialPresentationController;
  readonly renderCoordinator: ContextRenderCoordinator;
  readonly renderer: WebGLRenderer | null;
  readonly sources: ReadonlyMap<string, BackdropRegistration>;
  readContextState(): ContextDiagnosticsState;
}

/** Measurements reported after one successful presentation frame. */
export interface DiagnosticsFrameMeasurement {
  readonly drawCalls: number;
  readonly durationMs: number;
  readonly glError: number | null;
}

interface MutableDiagnosticsMetrics {
  frameCount: number;
  captureCount: number;
  drawCalls: number;
  errorCount: number;
  contextLossCount: number;
  contextRestoreCount: number;
  lastFrameDurationMs: number | null;
  lastCaptureDurationMs: number | null;
  lastGlError: number | null;
}

function createMetrics(): MutableDiagnosticsMetrics {
  return {
    frameCount: 0,
    captureCount: 0,
    drawCalls: 0,
    errorCount: 0,
    contextLossCount: 0,
    contextRestoreCount: 0,
    lastFrameDurationMs: null,
    lastCaptureDurationMs: null,
    lastGlError: null,
  };
}

/**
 * Aggregate stable diagnostics without exposing mutable context-owned managers.
 *
 * Structural and resource state is read lazily. Optional measurements are
 * collected only during an enabled debug epoch.
 */
export class ContextDiagnosticsController {
  private enabled: boolean;
  private metrics = createMetrics();
  private frameCompletionTimes: number[] = [];

  /** Create one diagnostics epoch around context-owned state readers. */
  public constructor(
    private readonly runtime: GlassEngineRuntime,
    private readonly owners: ContextDiagnosticsOwners,
    private readonly onUpdated: (snapshot: DiagnosticsSnapshot) => void,
    private readonly onDispatchError: (error: unknown) => void,
  ) {
    this.enabled = owners.readContextState().debugEnabled;
  }

  /** Return a detached snapshot; this remains valid after context destruction. */
  public getSnapshot(): DiagnosticsSnapshot {
    const context = this.owners.readContextState();
    const render = this.owners.renderCoordinator.getDiagnosticsState();
    const capture = this.owners.domCapture.getDiagnosticsState();
    const material = this.owners.materials.getDiagnosticsState();
    const contextEvents = this.owners.contextEvents.getDiagnosticsState();
    const renderer = this.owners.renderer?.getDiagnosticsState() ?? null;
    const fallback: FallbackStateSnapshot = this.owners.fallback.getSnapshot();
    const ratio = this.runtime.devicePixelRatio();
    const devicePixelRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    const registrations = this.readRegistrations();

    return {
      schemaVersion: 1,
      debugEnabled: this.enabled,
      lifecycle: context.destroyed
        ? 'destroyed'
        : (context.destroying ? 'destroying' : 'active'),
      mode: {
        renderMode: context.options.renderMode ?? 'uniform',
        renderPrecision: context.precision,
        devicePixelRatio,
        deviceScale: devicePixelRatio * context.precision,
        viewportMode: context.viewportMode,
        fallback: { ...fallback },
      },
      presentation: {
        rendererState: context.destroyed
          ? 'destroyed'
          : (renderer?.state ?? 'unavailable'),
        width: render.width,
        height: render.height,
        backdropTextureReady: render.backdropTextureReady,
      },
      registrations,
      scheduling: {
        layoutFramePending: contextEvents.pendingFrame,
        capture: {
          active: capture.active,
          pendingFrame: capture.pendingFrame,
          running: capture.running,
        },
        material: {
          pendingFrame: material.frames.pendingAnimationFrame,
          pendingTimer: material.frames.pendingTimer,
          activeMaterials: material.frames.activeMaterials,
          pendingUpdates: material.frames.pendingUpdates,
          renderRequested: material.frames.renderRequested,
        },
      },
      resources: {
        ownedCanvases: render.ownedCanvases + this.readOwnedBackdropCanvases(),
        trackedEventListeners: contextEvents.resources.eventListeners
          + capture.resources.eventListeners
          + material.resources.eventListeners
          + (renderer?.eventListeners ?? 0),
        resizeObservers: contextEvents.resources.resizeObservers
          + capture.resources.resizeObservers
          + material.resources.resizeObservers,
        mutationObservers: contextEvents.resources.mutationObservers
          + capture.resources.mutationObservers
          + material.resources.mutationObservers,
        intersectionObservers: contextEvents.resources.intersectionObservers
          + capture.resources.intersectionObservers
          + material.resources.intersectionObservers,
        pendingAnimationFrames: Number(contextEvents.pendingFrame)
          + Number(capture.pendingFrame)
          + Number(material.frames.pendingAnimationFrame),
        pendingTimers: Number(material.frames.pendingTimer)
          + material.pendingIdleTimers,
        activeCaptureTasks: capture.activeTasks,
        webgl: renderer ? { ...renderer.resources } : { ...EMPTY_WEBGL_RESOURCES },
      },
      metrics: this.enabled ? this.readMetrics() : null,
    };
  }

  /** Whether optional metrics collection is active. */
  public get isEnabled(): boolean {
    return this.enabled;
  }

  /** Start or stop a debug epoch and publish its initial transition snapshot. */
  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.metrics = createMetrics();
    this.frameCompletionTimes = [];
    this.dispatchSnapshot();
  }

  /** Record and publish one successful presentation frame. */
  public recordFrame(measurement: DiagnosticsFrameMeasurement): void {
    if (!this.enabled) return;
    this.metrics.frameCount += 1;
    this.metrics.drawCalls += measurement.drawCalls;
    this.metrics.lastFrameDurationMs = measurement.durationMs;
    this.metrics.lastGlError = measurement.glError;
    this.recordFrameCompletion();
    this.publish();
  }

  /** Record and publish one successful backdrop capture. */
  public recordCapture(durationMs: number | null): void {
    if (!this.enabled) return;
    this.metrics.captureCount += 1;
    if (durationMs !== null) this.metrics.lastCaptureDurationMs = durationMs;
    this.publish();
  }

  /** Record and publish one contextual failure. */
  public recordError(): void {
    if (!this.enabled) return;
    this.metrics.errorCount += 1;
    this.publish();
  }

  /** Record and publish one WebGL context loss. */
  public recordContextLoss(): void {
    if (!this.enabled) return;
    this.metrics.contextLossCount += 1;
    this.publish();
  }

  /** Record and publish one successful WebGL context restoration. */
  public recordContextRestore(): void {
    if (!this.enabled) return;
    this.metrics.contextRestoreCount += 1;
    this.publish();
  }

  /** Publish current structural state when debug events are enabled. */
  public publish(): void {
    if (this.enabled) this.dispatchSnapshot();
  }

  private readRegistrations(): DiagnosticsSnapshot['registrations'] {
    let domBackdrops = 0;
    let canvasBackdrops = 0;
    let dirtyBackdrops = 0;
    let readyBackdrops = 0;
    for (const source of this.owners.sources.values()) {
      if (isDomBackdropRegistration(source)) {
        domBackdrops += 1;
        if (source.canvas) readyBackdrops += 1;
      } else if (isCanvasBackdropRegistration(source)) {
        canvasBackdrops += 1;
        readyBackdrops += 1;
      }
      if (source.dirty) dirtyBackdrops += 1;
    }
    const materials = this.owners.materials.getDiagnosticsState();
    return {
      materials: materials.materials,
      materialsInViewport: materials.materialsInViewport,
      backdrops: domBackdrops + canvasBackdrops,
      domBackdrops,
      canvasBackdrops,
      dirtyBackdrops,
      readyBackdrops,
    };
  }

  private readOwnedBackdropCanvases(): number {
    let count = 0;
    for (const source of this.owners.sources.values()) {
      if (isCanvasBackdropRegistration(source) || source.canvas !== null) {
        count += 1;
      }
    }
    return count;
  }

  private readMetrics(): DiagnosticsMetricsSnapshot {
    return {
      ...this.metrics,
      framesPerSecond: this.resolveFramesPerSecond(),
    };
  }

  private dispatchSnapshot(): void {
    try {
      this.onUpdated(this.getSnapshot());
    } catch (error) {
      if (this.enabled) {
        this.metrics.errorCount += 1;
      }
      this.onDispatchError(error);
    }
  }

  private recordFrameCompletion(): void {
    const completedAt = readDiagnosticsTimestamp(this.runtime);
    this.frameCompletionTimes.push(completedAt);
    const cutoff = completedAt - 1_000;
    while (
      this.frameCompletionTimes.length > 1
      && (this.frameCompletionTimes[0] ?? completedAt) < cutoff
    ) {
      this.frameCompletionTimes.shift();
    }
  }

  private resolveFramesPerSecond(): number | null {
    if (this.frameCompletionTimes.length < 2) return null;
    const first = this.frameCompletionTimes[0] ?? 0;
    const last = this.frameCompletionTimes.at(-1) ?? first;
    const elapsed = last - first;
    return elapsed > 0
      ? ((this.frameCompletionTimes.length - 1) * 1_000) / elapsed
      : null;
  }
}
