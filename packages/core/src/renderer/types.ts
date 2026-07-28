import type { GlassError } from '../errors/GlassError';
import type {
  Matrix2D,
  RectLike,
  ShaderCornerRadii,
} from '../types/common';

/** Fully resolved material values consumed by one WebGL draw call. */
export interface RendererMaterial {
  /** Stable material identifier used in diagnostics. */
  id: string;
  /** Material bounds relative to the presentation canvas. */
  rect: RectLike;
  /** CSS affine transform in `matrix(a, b, c, d, e, f)` order. */
  matrix: Matrix2D;
  /** Corner radii in the legacy shader's uniform order. */
  radii: ShaderCornerRadii;
  /** Cumulative material opacity. */
  opacity: number;
  /** Optical glass thickness. */
  thickness: number;
  /** Index of refraction. */
  refractIndex: number;
  /** Refraction displacement multiplier. */
  refractIntensity: number;
  /** Frosted-glass blur amount. */
  blur: number;
  /** Chromatic dispersion strength. */
  dispersion: number;
}

/** Options used to construct a deterministic WebGL renderer. */
export interface WebGLRendererOptions {
  /** Render precision multiplied by device pixel ratio. */
  renderScale?: number;
  /** Lazily read device pixel ratio. */
  devicePixelRatio?: () => number;
  /** Callback invoked after a WebGL context is lost. */
  onContextLost?: () => void;
  /** Callback invoked after resources are rebuilt on context restoration. */
  onContextRestored?: () => void;
  /** Callback invoked when WebGL resources cannot be rebuilt after restoration. */
  onContextRestoreError?: (error: GlassError) => void;
}

/** Result of one synchronous renderer pass. */
export interface RendererFrameResult {
  /** Number of material draw calls issued. */
  drawCalls: number;
  /** WebGL error code observed after the pass. */
  glError: number;
}

/** Current owned WebGL resource counts. */
export interface RendererResourceCounts {
  /** Compiled shaders not yet released after linking. */
  shaders: number;
  /** Linked programs. */
  programs: number;
  /** Vertex buffers. */
  buffers: number;
  /** Vertex-array objects. */
  vertexArrays: number;
  /** Backdrop textures. */
  textures: number;
}

/** Narrow renderer state consumed by context diagnostics. */
export interface WebGLRendererDiagnosticsState {
  /** Current renderer lifecycle state. */
  readonly state: 'ready' | 'context-lost' | 'destroyed';
  /** Number of context lifecycle listeners owned by the renderer. */
  readonly eventListeners: number;
  /** Current live graphics resource counts. */
  readonly resources: RendererResourceCounts;
}
