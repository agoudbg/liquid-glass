export function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');

    // Prefer WebGL2 (our renderer requires it). Fallback to WebGL1 only if nothing else is available.
    const hasWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && canvas.getContext('webgl2');
    return Boolean(hasWebGL2);
  } catch {
    return false;
  }
}

/**
 * Detect if the current device is a mobile device (iOS, Android, etc.)
 */
export function isMobileDevice(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Maximum canvas dimension for mobile devices to prevent OOM crashes.
 * iOS WebKit has strict memory limits, and large canvases can cause crashes.
 */
export const MAX_CANVAS_DIMENSION_MOBILE = 2048;

/**
 * Maximum device pixel ratio for mobile devices.
 * High DPR (3x on iPhone Pro) combined with large canvases causes OOM.
 */
export const MAX_DPR_MOBILE = 1.5;

/**
 * Get a safe device pixel ratio that won't cause OOM on mobile.
 * On mobile devices with DPR > 2, we clamp to MAX_DPR_MOBILE.
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
 * Returns clamped { width, height } values.
 */
export function clampCanvasDimensions(width: number, height: number): { width: number; height: number } {
  if (!isMobileDevice()) {
    return { width, height };
  }

  const maxDim = MAX_CANVAS_DIMENSION_MOBILE;
  const clampedWidth = Math.min(width, maxDim);
  const clampedHeight = Math.min(height, maxDim);

  return { width: clampedWidth, height: clampedHeight };
}

/**
 * Parse a CSS transform string into a 2D matrix [a, b, c, d, e, f].
 * Handles both `matrix(a, b, c, d, e, f)` and `matrix3d(...)` formats.
 * Returns the identity matrix [1, 0, 0, 1, 0, 0] if parsing fails or transform is 'none'.
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
 * Given matrix [a, b, c, d, e, f], returns the inverse matrix.
 * Returns identity if the matrix is singular (determinant = 0).
 */
export function invertMatrix2D(
  matrix: [number, number, number, number, number, number],
): [number, number, number, number, number, number] {
  const [a, b, c, d, e, f] = matrix;
  const det = a * d - b * c;

  if (Math.abs(det) < 1e-10) {
    // Singular matrix, return identity
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
