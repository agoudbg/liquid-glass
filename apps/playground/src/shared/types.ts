import type {
  GlassContext,
  ViewportCaptureRect,
} from '@agou/liquid-glass-core';

import type { FrameworkId } from '../app-meta';
import type { SceneId } from './scene-catalog';

export type { SceneId } from './scene-catalog';

/** Test-only fixture identifiers accepted by the playground URL. */
export type PlaygroundTestFixture = 'interaction-policy';

/** Complete URL-addressable state shared by all framework hosts. */
export interface PlaygroundState {
  /** Active public framework adapter. */
  framework: FrameworkId;
  /** Active canonical scene. */
  scene: SceneId;
  /** Current core rendering strategy. */
  renderMode: 'uniform';
  /** Whether the core-owned presentation canvas is visible. */
  glassEnabled: boolean;
  /** Whether the shell requests forced CSS fallback from the core context. */
  fallbackEnabled: boolean;
  /** Whether the framework host exposes a scrolling glass surface. */
  scrollable: boolean;
  /** Whether the context forces viewport-limited DOM capture. */
  viewportEnabled: boolean;
  /** Current deterministic DOM content variant in capture scenes. */
  domVariant: 'source' | 'mutated';
  /** Material thickness in CSS pixels. */
  thickness: number;
  /** Material index of refraction. */
  refractIndex: number;
  /** Material refraction displacement multiplier. */
  refractIntensity: number;
  /** Primary material corner radius in CSS pixels. */
  radius: number;
  /** Backing-canvas render scale. */
  renderPrecision: number;
  /** Whether deterministic browser-test presentation is active. */
  testMode: boolean;
  /** Optional browser-test fixture gated by scene and test mode. */
  testFixture: PlaygroundTestFixture | null;
  /** Whether the exact legacy S001/S002 capture geometry is active. */
  oracleMode: boolean;
}

/** Diagnostics surfaced by a mounted core rendering context. */
export interface HostRuntimeReport {
  /** Current renderer lifecycle state. */
  status: 'initializing' | 'ready' | 'error';
  /** Whether core currently resolves the context to CSS fallback. */
  fallbackMode: boolean;
  /** Number of completed material frames observed by the shell. */
  frameCount: number;
  /** Number of completed backdrop captures observed by the shell. */
  captureCount: number;
  /** Metadata for the most recently completed backdrop capture. */
  lastCapture: BackdropCaptureReport | null;
  /** Current presentation-canvas width in physical pixels. */
  canvasWidth: number;
  /** Current presentation-canvas height in physical pixels. */
  canvasHeight: number;
  /** Stable WebGL error label, or null before a context exists. */
  glError: string | null;
  /** Human-readable contextual failure, when present. */
  error: string | null;
}

/** Serializable diagnostics for one completed backdrop capture. */
export interface BackdropCaptureReport {
  /** Stable core backdrop registration identifier. */
  id: string;
  /** Captured bitmap width in physical pixels. */
  width: number;
  /** Captured bitmap height in physical pixels. */
  height: number;
  /** Optional source-local bounds used for viewport capture. */
  viewportRect?: ViewportCaptureRect;
}

/** Lifecycle callbacks implemented once by the framework-neutral shell. */
export interface FrameworkHostCallbacks {
  /** Attach diagnostics after an adapter creates its core context. */
  onContextReady(context: GlassContext): void;
  /** Publish or clear the active framework converter refresh command. */
  onBackdropRefreshReady(refresh: (() => void) | null): void;
  /** Surface adapter context-creation failures. */
  onError(error: unknown): void;
}

/** Common props rendered by each real framework host. */
export interface FrameworkHostProps {
  /** Immutable state snapshot for the current render. */
  state: PlaygroundState;
  /** Stable lifecycle callbacks owned by the shell. */
  callbacks: FrameworkHostCallbacks;
}

/** Framework-neutral owner returned after mounting one host. */
export interface FrameworkHostController {
  /** Apply a new state snapshot without recreating the framework root. */
  update(state: PlaygroundState): void;
  /** Unmount the framework root and release its context. */
  destroy(): void;
}

/** Public mount contract implemented by Vue, React, and Solid hosts. */
export type FrameworkHostMount = (
  container: HTMLElement,
  state: PlaygroundState,
  callbacks: FrameworkHostCallbacks,
) => FrameworkHostController;
