/**
 * A canvas that can participate in capture, rendering, or composition.
 */
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

/**
 * The six components of a CSS two-dimensional affine transform matrix.
 *
 * The tuple follows the browser `matrix(a, b, c, d, e, f)` order.
 */
export type Matrix2D = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
];

/**
 * Four scalar corner radii expressed in CSS pixels.
 */
export interface CornerRadii {
  /** Top-left corner radius. */
  topLeft: number;
  /** Top-right corner radius. */
  topRight: number;
  /** Bottom-right corner radius. */
  bottomRight: number;
  /** Bottom-left corner radius. */
  bottomLeft: number;
}

/**
 * Corner radii in the order expected by the legacy fragment shader uniform.
 */
export type ShaderCornerRadii = readonly [
  topRight: number,
  bottomRight: number,
  bottomLeft: number,
  topLeft: number,
];

/**
 * A framework-neutral rectangle measured in CSS pixels.
 */
export interface RectLike {
  /** Horizontal offset from the relevant origin. */
  x: number;
  /** Vertical offset from the relevant origin. */
  y: number;
  /** Rectangle width. */
  width: number;
  /** Rectangle height. */
  height: number;
}

/**
 * A two-dimensional size measured in pixels.
 */
export interface Size {
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
}
