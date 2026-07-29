import type { GlassEngineRuntime } from './runtime';

/** Internal observer and listener counts exposed by one resource owner. */
export interface ObserverResourceState {
  readonly eventListeners: number;
  readonly resizeObservers: number;
  readonly mutationObservers: number;
  readonly intersectionObservers: number;
}

/** Internal state exposed by the DOM capture controller. */
export interface DomCaptureDiagnosticsState {
  readonly active: boolean;
  readonly activeTasks: number;
  readonly pendingFrame: boolean;
  readonly running: boolean;
  readonly resources: ObserverResourceState;
}

/** Internal state exposed by a context layout-event owner. */
export interface ContextEventDiagnosticsState {
  readonly pendingFrame: boolean;
  readonly resources: ObserverResourceState;
}

/** Internal state exposed by the shared frame scheduler. */
export interface ContextFrameDiagnosticsState {
  readonly pendingAnimationFrame: boolean;
  readonly pendingTimer: boolean;
}

/** Internal state exposed by the material frame coordinator. */
export interface MaterialFrameDiagnosticsState extends ContextFrameDiagnosticsState {
  readonly activeMaterials: number;
  readonly pendingUpdates: number;
  readonly renderRequested: boolean;
}

/** Internal state exposed by outgoing material delegation. */
export interface MaterialDelegationDiagnosticsState {
  readonly activeMaterials: number;
  readonly frames: ContextFrameDiagnosticsState;
}

/** Internal aggregate exposed by the material presentation owner. */
export interface MaterialPresentationDiagnosticsState {
  readonly materials: number;
  readonly materialsInViewport: number;
  readonly pendingIdleTimers: number;
  readonly frames: MaterialFrameDiagnosticsState;
  readonly delegation: MaterialDelegationDiagnosticsState;
  readonly resources: ObserverResourceState;
}

/** Internal renderer-independent presentation state. */
export interface ContextRenderDiagnosticsState {
  readonly backdropTextureReady: boolean;
  readonly height: number;
  readonly ownedCanvases: number;
  readonly width: number;
}

/** Return a monotonic timestamp when available without requiring browser globals. */
export function readDiagnosticsTimestamp(runtime: GlassEngineRuntime): number {
  if (runtime.now) return runtime.now();
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

/** Clamp a measured duration so clock adjustments cannot expose negatives. */
export function resolveDiagnosticsDuration(
  startedAt: number,
  finishedAt: number,
): number {
  const duration = finishedAt - startedAt;
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}
