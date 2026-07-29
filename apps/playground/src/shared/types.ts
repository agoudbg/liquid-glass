import type {
  GlassContext,
  InteractionPreset,
  PartialInteractionConfig,
  RenderMode,
  ViewportCaptureRect,
} from '@agou/liquid-glass-core';

import type { FrameworkId } from '../app-meta';
import type { SceneId } from './scene-catalog';

export type { SceneId } from './scene-catalog';

/** Test-only fixture identifiers accepted by the playground URL. */
export type PlaygroundTestFixture = 'interaction-policy';

/** Optical values owned only by the editable Lab scene. */
export interface LabOpticsState {
  /** Material thickness in CSS pixels. */
  thickness: number;
  /** Material index of refraction. */
  refractIndex: number;
  /** Material refraction displacement multiplier. */
  refractIntensity: number;
  /** Frosted-glass blur amount. */
  blur: number;
  /** Chromatic dispersion strength. */
  dispersion: number;
}

/** Corner geometry owned only by the editable Lab scene. */
export interface LabShapeState {
  /** Shared radius used by the compact inspector control. */
  radius: number;
  /** Top-left radius in CSS pixels. */
  radiusTL: number;
  /** Top-right radius in CSS pixels. */
  radiusTR: number;
  /** Bottom-right radius in CSS pixels. */
  radiusBR: number;
  /** Bottom-left radius in CSS pixels. */
  radiusBL: number;
}

/** CSS appearance values owned only by the editable Lab scene. */
export interface LabAppearanceState {
  /** Whether the material uses an explicit tint. */
  useCustomColor: boolean;
  /** Explicit tint used when custom color is enabled. */
  backgroundColor: string;
  /** Rim-light direction in degrees. */
  illuminationAngle: number;
  /** Rim-light opacity multiplier. */
  illuminationIntensity: number;
}

/** Pointer policy and preset values owned only by the editable Lab scene. */
export interface LabInteractionState {
  /** Whether pointer-driven material presentation is disabled. */
  disableInteractions: boolean;
  /** Whether hover-only pointer input is ignored. */
  onlyClickInteractions: boolean;
  /** Whether translation and hover-follow are suppressed for a moveable host. */
  isMoveable: boolean;
  /** Public interaction preset selected for the focused material. */
  preset: InteractionPreset;
  /** Typed overrides applied on top of the selected preset. */
  config: PartialInteractionConfig;
}

/** Renderer values owned only by the editable Lab scene. */
export interface LabRenderState {
  /** Explicit focused-material render order. */
  order: number;
}

/** Backdrop source values reserved for the editable Lab scene. */
export interface LabSourceState {
  /** Focused backdrop implementation. */
  kind: 'canvas' | 'dom';
  /** Fill used behind the focused backdrop source. */
  backgroundColor: string;
}

/** Complete editable state for the focused Lab scene. */
export interface LabState {
  /** Shader-facing optical controls. */
  optics: LabOpticsState;
  /** Material corner geometry. */
  shape: LabShapeState;
  /** Framework adapter CSS appearance. */
  appearance: LabAppearanceState;
  /** Pointer interaction policy and preset. */
  interaction: LabInteractionState;
  /** Context and material render controls. */
  render: LabRenderState;
  /** Backdrop source selection. */
  source: LabSourceState;
}

/** Complete URL-addressable state shared by all framework hosts. */
export interface PlaygroundState {
  /** Active public framework adapter. */
  framework: FrameworkId;
  /** Active canonical scene. */
  scene: SceneId;
  /** Current core rendering strategy. */
  renderMode: RenderMode;
  /** Global backing-canvas scale shared by every scene and framework host. */
  renderPrecision: number;
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
  /** Editable controls isolated from fixed canonical and oracle scenes. */
  lab: LabState;
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
  /** Track an additional nested or proxy-source context in Composition scenes. */
  onAuxiliaryContextReady?(context: GlassContext): void;
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
