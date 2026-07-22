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
