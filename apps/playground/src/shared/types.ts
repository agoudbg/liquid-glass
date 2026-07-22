import type { GlassContext } from '@agou/liquid-glass-core';

import type { FrameworkId } from '../app-meta';

/** Canonical visible scenes available in the P3 playground slice. */
export type SceneId = 'S001' | 'S002';

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
  /** Whether the exact legacy S001/S002 capture geometry is active. */
  oracleMode: boolean;
}

/** Diagnostics surfaced by a mounted core rendering context. */
export interface HostRuntimeReport {
  /** Current renderer lifecycle state. */
  status: 'initializing' | 'ready' | 'error';
  /** Number of completed material frames observed by the shell. */
  frameCount: number;
  /** Current presentation-canvas width in physical pixels. */
  canvasWidth: number;
  /** Current presentation-canvas height in physical pixels. */
  canvasHeight: number;
  /** Stable WebGL error label, or null before a context exists. */
  glError: string | null;
  /** Human-readable contextual failure, when present. */
  error: string | null;
}

/** Lifecycle callbacks implemented once by the framework-neutral shell. */
export interface FrameworkHostCallbacks {
  /** Attach diagnostics after an adapter creates its core context. */
  onContextReady(context: GlassContext): void;
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
