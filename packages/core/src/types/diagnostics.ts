import type { RenderMode } from './context';

/** Lifecycle state represented by a context diagnostics snapshot. */
export type DiagnosticsLifecycleState = 'active' | 'destroying' | 'destroyed';

/** WebGL renderer availability represented without exposing renderer internals. */
export type DiagnosticsRendererState =
  | 'ready'
  | 'context-lost'
  | 'unavailable'
  | 'destroyed';

/** Current fallback policy and the causes contributing to it. */
export interface DiagnosticsFallbackSnapshot {
  /** Whether automatic fallback is enabled. */
  readonly enabled: boolean;
  /** Whether fallback was explicitly forced. */
  readonly forced: boolean;
  /** Whether WebGL2 renderer creation failed. */
  readonly rendererUnavailable: boolean;
  /** Whether an existing WebGL context is currently lost. */
  readonly contextLost: boolean;
  /** Whether fallback presentation is currently effective. */
  readonly effective: boolean;
}

/** Current rendering modes and effective scale values. */
export interface DiagnosticsModeSnapshot {
  /** Active canvas presentation strategy. */
  readonly renderMode: RenderMode;
  /** Normalized context render precision. */
  readonly renderPrecision: number;
  /** Sanitized browser device pixel ratio. */
  readonly devicePixelRatio: number;
  /** Device pixel ratio multiplied by render precision. */
  readonly deviceScale: number;
  /** Whether viewport-limited capture is active. */
  readonly viewportMode: boolean;
  /** Current fallback policy and causes. */
  readonly fallback: DiagnosticsFallbackSnapshot;
}

/** Current visible presentation and renderer state. */
export interface DiagnosticsPresentationSnapshot {
  /** Current renderer lifecycle state. */
  readonly rendererState: DiagnosticsRendererState;
  /** Presentation canvas width in physical pixels. */
  readonly width: number;
  /** Presentation canvas height in physical pixels. */
  readonly height: number;
  /** Whether a valid backdrop texture is available for reuse. */
  readonly backdropTextureReady: boolean;
}

/** Current context-owned registration counts. */
export interface DiagnosticsRegistrationSnapshot {
  /** Number of live material registrations. */
  readonly materials: number;
  /** Number of material registrations currently intersecting the viewport. */
  readonly materialsInViewport: number;
  /** Number of live backdrop registrations. */
  readonly backdrops: number;
  /** Number of live DOM backdrop registrations. */
  readonly domBackdrops: number;
  /** Number of live custom-canvas backdrop registrations. */
  readonly canvasBackdrops: number;
  /** Number of backdrop registrations awaiting new pixels. */
  readonly dirtyBackdrops: number;
  /** Number of backdrop registrations with a retained bitmap. */
  readonly readyBackdrops: number;
}

/** Current serialized DOM capture scheduler state. */
export interface DiagnosticsCaptureSchedulerSnapshot {
  /** Whether a DOM capture scheduler currently exists. */
  readonly active: boolean;
  /** Whether a DOM capture frame is queued. */
  readonly pendingFrame: boolean;
  /** Whether asynchronous DOM capture work is running. */
  readonly running: boolean;
}

/** Current shared material frame scheduler state. */
export interface DiagnosticsMaterialSchedulerSnapshot {
  /** Whether a material animation frame is queued. */
  readonly pendingFrame: boolean;
  /** Whether a timer-backed material frame is queued. */
  readonly pendingTimer: boolean;
  /** Number of materials currently advancing interaction motion. */
  readonly activeMaterials: number;
  /** Number of materials with coalesced configuration updates. */
  readonly pendingUpdates: number;
  /** Whether a material-only redraw has been requested. */
  readonly renderRequested: boolean;
}

/** Current outgoing proxy-delegation scheduler state. */
export interface DiagnosticsDelegationSchedulerSnapshot {
  /** Whether continuous delegated-layout synchronization has a queued frame. */
  readonly pendingFrame: boolean;
  /** Whether a timer fallback owns the queued synchronization frame. */
  readonly pendingTimer: boolean;
  /** Number of source materials currently rendered by proxy targets. */
  readonly activeMaterials: number;
}

/** Current context-owned scheduling state. */
export interface DiagnosticsSchedulingSnapshot {
  /** Whether a layout or scroll frame is queued. */
  readonly layoutFramePending: boolean;
  /** Current DOM capture scheduling state. */
  readonly capture: DiagnosticsCaptureSchedulerSnapshot;
  /** Current material scheduling state. */
  readonly material: DiagnosticsMaterialSchedulerSnapshot;
  /** Current outgoing material delegation scheduling state. */
  readonly delegation: DiagnosticsDelegationSchedulerSnapshot;
}

/** Live WebGL resource counts owned by one renderer. */
export interface DiagnosticsWebGLResourceCounts {
  /** Compiled shader objects retained by the renderer. */
  readonly shaders: number;
  /** Linked shader programs retained by the renderer. */
  readonly programs: number;
  /** Vertex buffers retained by the renderer. */
  readonly buffers: number;
  /** Vertex-array objects retained by the renderer. */
  readonly vertexArrays: number;
  /** Backdrop textures retained by the renderer. */
  readonly textures: number;
}

/** Current context-owned browser and graphics resource counts. */
export interface DiagnosticsResourceSnapshot {
  /** Core-owned canvases or retained captured canvas bitmaps. */
  readonly ownedCanvases: number;
  /** Browser event listeners tracked by core context owners. */
  readonly trackedEventListeners: number;
  /** Live resize observers tracked by core context owners. */
  readonly resizeObservers: number;
  /** Live mutation observers tracked by core context owners. */
  readonly mutationObservers: number;
  /** Live intersection observers tracked by core context owners. */
  readonly intersectionObservers: number;
  /** Queued animation frames tracked by core context owners. */
  readonly pendingAnimationFrames: number;
  /** Queued timer-backed frames and interaction idle timers. */
  readonly pendingTimers: number;
  /** DOM rasterization tasks still owned by the context capture scheduler. */
  readonly activeCaptureTasks: number;
  /** Live WebGL resources owned by the renderer. */
  readonly webgl: DiagnosticsWebGLResourceCounts;
}

/** Measurements collected while context debugging is enabled. */
export interface DiagnosticsMetricsSnapshot {
  /** Number of completed presentation frames in the current debug epoch. */
  readonly frameCount: number;
  /** Number of completed backdrop captures in the current debug epoch. */
  readonly captureCount: number;
  /** Total WebGL material draw calls in the current debug epoch. */
  readonly drawCalls: number;
  /** Number of contextual core errors in the current debug epoch. */
  readonly errorCount: number;
  /** Number of WebGL context-loss notifications in the current debug epoch. */
  readonly contextLossCount: number;
  /** Number of successful WebGL context restorations in the current debug epoch. */
  readonly contextRestoreCount: number;
  /** Rolling completed-frame rate, or null before two timed frames. */
  readonly framesPerSecond: number | null;
  /** Duration of the most recently completed frame, in milliseconds. */
  readonly lastFrameDurationMs: number | null;
  /** Duration of the most recently completed DOM capture, in milliseconds. */
  readonly lastCaptureDurationMs: number | null;
  /** WebGL error code reported by the most recent WebGL frame. */
  readonly lastGlError: number | null;
}

/** Detached structured diagnostics for one glass context. */
export interface DiagnosticsSnapshot {
  /** Diagnostics schema version for stable consumer parsing. */
  readonly schemaVersion: 1;
  /** Whether optional measurements and update events are enabled. */
  readonly debugEnabled: boolean;
  /** Current context lifecycle state. */
  readonly lifecycle: DiagnosticsLifecycleState;
  /** Current rendering mode and scale data. */
  readonly mode: DiagnosticsModeSnapshot;
  /** Current presentation and renderer state. */
  readonly presentation: DiagnosticsPresentationSnapshot;
  /** Current registration counts. */
  readonly registrations: DiagnosticsRegistrationSnapshot;
  /** Current scheduling state. */
  readonly scheduling: DiagnosticsSchedulingSnapshot;
  /** Current live resource counts. */
  readonly resources: DiagnosticsResourceSnapshot;
  /** Optional measurements for the current debug epoch. */
  readonly metrics: DiagnosticsMetricsSnapshot | null;
}
