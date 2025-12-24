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
