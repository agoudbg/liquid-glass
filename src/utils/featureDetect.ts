/**
 * @fileoverview Feature detection and device capability utilities.
 *
 * This module provides utilities for:
 * - WebGL support detection
 * - Mobile device detection
 * - Safe DPR (Device Pixel Ratio) calculation to prevent OOM on mobile
 * - Canvas dimension clamping for memory safety
 * - CSS transform matrix parsing and inversion
 *
 * @module utils/featureDetect
 */

// =============================================================================
// WebGL Feature Detection
// =============================================================================

/**
 * Check if WebGL2 is supported in the current browser.
 * The Liquid Glass renderer requires WebGL2 for advanced shader features.
 *
 * @returns true if WebGL2 is available, false otherwise
 *
 * @example
 * if (!isWebGLSupported()) {
 *   // Fall back to CSS backdrop-filter
 * }
 */
export function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const hasWebGL2 = typeof WebGL2RenderingContext !== 'undefined'
      && canvas.getContext('webgl2');
    return Boolean(hasWebGL2);
  } catch {
    return false;
  }
}

// =============================================================================
// Device Detection
// =============================================================================

/**
 * Detect if the current device is a mobile device (iOS, Android, etc.).
 * Used for memory-safe rendering adjustments.
 *
 * @returns true if running on a mobile device
 */
export function isMobileDevice(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

// =============================================================================
// Mobile Memory Safety Constants
// =============================================================================

/**
 * Maximum canvas dimension for mobile devices to prevent OOM crashes.
 * iOS WebKit has strict memory limits (~100MB for canvas backing store).
 * A 2048x2048 canvas at 2x DPR uses ~64MB.
 */
export const MAX_CANVAS_DIMENSION_MOBILE = 2048;

/**
 * Maximum device pixel ratio for mobile devices.
 * High DPR (3x on iPhone Pro) combined with large canvases causes OOM.
 * Clamping to 1.5x provides good quality while staying memory-safe.
 */
export const MAX_DPR_MOBILE = 1.5;

/**
 * Get a safe device pixel ratio that won't cause OOM on mobile.
 * On mobile devices with DPR > 2, we clamp to MAX_DPR_MOBILE.
 *
 * @returns Safe DPR value for canvas sizing
 */
export function getSafeDevicePixelRatio(): number {
  const dpr = window.devicePixelRatio || 1;
  if (isMobileDevice() && dpr > 2) {
    return MAX_DPR_MOBILE;
  }
  return dpr;
}

/**
 * Clamp canvas dimensions to safe limits on mobile devices.
 * Prevents canvas allocation failures on memory-constrained devices.
 *
 * @param width - Requested canvas width in pixels
 * @param height - Requested canvas height in pixels
 * @returns Clamped dimensions that are safe to allocate
 */
export function clampCanvasDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  if (!isMobileDevice()) {
    return { width, height };
  }

  const maxDim = MAX_CANVAS_DIMENSION_MOBILE;
  return {
    width: Math.min(width, maxDim),
    height: Math.min(height, maxDim),
  };
}

// =============================================================================
// CSS Transform Matrix Utilities
// =============================================================================

/**
 * Parse a CSS transform string into a 2D matrix [a, b, c, d, e, f].
 *
 * Handles both formats:
 * - `matrix(a, b, c, d, e, f)` - Standard 2D transform
 * - `matrix3d(...)` - 3D transform (extracts 2D portion)
 *
 * The matrix represents the transform:
 * ```
 * | a c e |   | x |
 * | b d f | × | y |
 * | 0 0 1 |   | 1 |
 * ```
 *
 * @param transformString - CSS transform value from getComputedStyle
 * @returns 2D matrix [a, b, c, d, e, f], or identity if parsing fails
 */
export function parseCSSTransformMatrix(
  transformString: string,
): [number, number, number, number, number, number] {
  const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

  if (!transformString || transformString === 'none') {
    return identity;
  }

  // Try to match matrix(a, b, c, d, e, f)
  const matrix2dMatch = transformString.match(
    /^matrix\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\s*\)$/,
  );
  if (matrix2dMatch) {
    const values = matrix2dMatch.slice(1).map(Number);
    if (values.every((v) => !Number.isNaN(v))) {
      return values as [number, number, number, number, number, number];
    }
  }

  // Try to match matrix3d(...) - extract the 2D portion
  const matrix3dMatch = transformString.match(/^matrix3d\((.+)\)$/);
  if (matrix3dMatch) {
    const values = matrix3dMatch[1].split(',').map((s) => parseFloat(s.trim()));
    // 4x4 matrix in column-major order:
    // [m11, m21, m31, m41, m12, m22, m32, m42, m13, m23, m33, m43, m14, m24, m34, m44]
    // The 2D portion is:
    // a = m11 (index 0), b = m21 (index 1), c = m12 (index 4), d = m22 (index 5)
    // e = m14 (index 12), f = m24 (index 13)
    if (values.length >= 16 && values.every((v) => !Number.isNaN(v))) {
      return [values[0], values[1], values[4], values[5], values[12], values[13]];
    }
  }

  return identity;
}

/**
 * Compute the inverse of a 2D transform matrix.
 *
 * Given matrix [a, b, c, d, e, f], computes the matrix that undoes the transform.
 * Used for converting screen coordinates back to element coordinates.
 *
 * @param matrix - 2D transform matrix [a, b, c, d, e, f]
 * @returns Inverse matrix, or identity if the matrix is singular
 */
export function invertMatrix2D(
  matrix: [number, number, number, number, number, number],
): [number, number, number, number, number, number] {
  const [a, b, c, d, e, f] = matrix;
  const det = a * d - b * c;

  // Singular matrix (determinant ≈ 0) has no inverse
  if (Math.abs(det) < 1e-10) {
    return [1, 0, 0, 1, 0, 0];
  }

  const invDet = 1 / det;
  return [
    d * invDet,
    -b * invDet,
    -c * invDet,
    a * invDet,
    (c * f - d * e) * invDet,
    (b * e - a * f) * invDet,
  ];
}
