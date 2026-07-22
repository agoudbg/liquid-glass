import type { Size } from '../types/common';

/**
 * Maximum mobile backing-store dimension retained from the reference build.
 */
export const MAX_CANVAS_DIMENSION_MOBILE = 2048;

/**
 * DPR used for mobile devices above the reference implementation's 2x cutoff.
 */
export const MAX_DPR_MOBILE = 1.5;

/**
 * Optional environment values used to make capability detection deterministic.
 */
export interface FeatureDetectionEnvironment {
  /** Document used to probe a WebGL2 canvas. */
  document?: Pick<Document, 'createElement'> | null;
  /** User agent used by the legacy mobile-device classifier. */
  userAgent?: string;
  /** Device pixel ratio reported by the host window. */
  devicePixelRatio?: number;
  /** Override for WebGL2 constructor availability. */
  hasWebGL2Constructor?: boolean;
  /** Override for OffscreenCanvas availability. */
  hasOffscreenCanvas?: boolean;
  /** Override for ResizeObserver availability. */
  hasResizeObserver?: boolean;
  /** Override for MutationObserver availability. */
  hasMutationObserver?: boolean;
  /** Override for IntersectionObserver availability. */
  hasIntersectionObserver?: boolean;
  /** Override for CSS backdrop-filter support. */
  hasCssBackdropFilter?: boolean;
}

/**
 * Browser capabilities relevant to rendering and fallback decisions.
 */
export interface FeatureSupport {
  /** Whether a WebGL2 context can actually be created. */
  webgl2: boolean;
  /** Whether OffscreenCanvas exists. */
  offscreenCanvas: boolean;
  /** Whether ResizeObserver exists. */
  resizeObserver: boolean;
  /** Whether MutationObserver exists. */
  mutationObserver: boolean;
  /** Whether IntersectionObserver exists. */
  intersectionObserver: boolean;
  /** Whether CSS backdrop filtering is supported. */
  cssBackdropFilter: boolean;
  /** Whether the reference user-agent classifier considers the device mobile. */
  mobile: boolean;
  /** Memory-safe DPR selected for the environment. */
  devicePixelRatio: number;
}

let cachedDefaultWebGL2Support: boolean | undefined;

function resolveDocument(
  environment: FeatureDetectionEnvironment,
): Pick<Document, 'createElement'> | null {
  if (environment.document !== undefined) {
    return environment.document;
  }

  return typeof globalThis.document === 'undefined' ? null : globalThis.document;
}

function detectCssBackdropFilter(): boolean {
  if (typeof globalThis.CSS?.supports !== 'function') {
    return false;
  }

  return globalThis.CSS.supports('backdrop-filter', 'blur(1px)')
    || globalThis.CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
}

/**
 * Check whether WebGL2 is both exposed and capable of creating a context.
 *
 * @param environment - Optional deterministic capability environment.
 * @returns `true` only when a context can be created.
 */
export function isWebGLSupported(
  environment: FeatureDetectionEnvironment = {},
): boolean {
  const canUseDefaultCache = Object.keys(environment).length === 0;
  if (canUseDefaultCache && cachedDefaultWebGL2Support === true) {
    return true;
  }

  try {
    const targetDocument = resolveDocument(environment);
    const hasConstructor = environment.hasWebGL2Constructor
      ?? typeof globalThis.WebGL2RenderingContext !== 'undefined';

    if (!targetDocument || !hasConstructor) {
      return false;
    }

    const canvas = targetDocument.createElement('canvas');
    const context = canvas.getContext('webgl2');
    const supported = context !== null;

    // A capability probe must not consume one of the browser's finite WebGL contexts.
    context?.getExtension('WEBGL_lose_context')?.loseContext();

    if (canUseDefaultCache && supported) {
      cachedDefaultWebGL2Support = true;
    }
    return supported;
  } catch {
    return false;
  }
}

/**
 * Alias that makes the required WebGL version explicit.
 *
 * @param environment - Optional deterministic capability environment.
 * @returns `true` only when a WebGL2 context can be created.
 */
export function isWebGL2Supported(
  environment: FeatureDetectionEnvironment = {},
): boolean {
  return isWebGLSupported(environment);
}

/**
 * Apply the reference implementation's mobile user-agent classification.
 *
 * @param environment - Optional environment containing an explicit user agent.
 * @returns Whether the user agent identifies iOS, iPadOS, or Android.
 */
export function isMobileDevice(
  environment: FeatureDetectionEnvironment = {},
): boolean {
  const userAgent = environment.userAgent
    ?? (typeof globalThis.navigator === 'undefined' ? '' : globalThis.navigator.userAgent);
  return /iPhone|iPad|iPod|Android/i.test(userAgent);
}

/**
 * Select a device pixel ratio that preserves the reference mobile memory guard.
 *
 * @param environment - Optional DPR and user-agent environment.
 * @returns The reported DPR, except mobile values above 2x resolve to 1.5x.
 */
export function getSafeDevicePixelRatio(
  environment: FeatureDetectionEnvironment = {},
): number {
  const devicePixelRatio = environment.devicePixelRatio
    ?? (typeof globalThis.window === 'undefined' ? 1 : globalThis.window.devicePixelRatio || 1);

  if (isMobileDevice(environment) && devicePixelRatio > 2) {
    return MAX_DPR_MOBILE;
  }

  return devicePixelRatio;
}

/**
 * Clamp mobile canvas dimensions to the reference 2048-pixel allocation guard.
 *
 * @param width - Requested backing-store width.
 * @param height - Requested backing-store height.
 * @param environment - Optional user-agent environment.
 * @returns Requested dimensions on desktop and independently clamped dimensions on mobile.
 */
export function clampCanvasDimensions(
  width: number,
  height: number,
  environment: FeatureDetectionEnvironment = {},
): Size {
  if (!isMobileDevice(environment)) {
    return { width, height };
  }

  return {
    width: Math.min(width, MAX_CANVAS_DIMENSION_MOBILE),
    height: Math.min(height, MAX_CANVAS_DIMENSION_MOBILE),
  };
}

/**
 * Collect all renderer-relevant browser capabilities in one immutable snapshot.
 *
 * @param environment - Optional deterministic capability environment.
 * @returns Capability snapshot used during context initialization.
 */
export function detectFeatures(
  environment: FeatureDetectionEnvironment = {},
): FeatureSupport {
  return {
    webgl2: isWebGLSupported(environment),
    offscreenCanvas: environment.hasOffscreenCanvas
      ?? typeof globalThis.OffscreenCanvas !== 'undefined',
    resizeObserver: environment.hasResizeObserver
      ?? typeof globalThis.ResizeObserver !== 'undefined',
    mutationObserver: environment.hasMutationObserver
      ?? typeof globalThis.MutationObserver !== 'undefined',
    intersectionObserver: environment.hasIntersectionObserver
      ?? typeof globalThis.IntersectionObserver !== 'undefined',
    cssBackdropFilter: environment.hasCssBackdropFilter ?? detectCssBackdropFilter(),
    mobile: isMobileDevice(environment),
    devicePixelRatio: getSafeDevicePixelRatio(environment),
  };
}

/**
 * Determine whether core must avoid the WebGL rendering path.
 *
 * @param features - Previously detected capabilities.
 * @returns `true` when WebGL2 is unavailable.
 */
export function requiresFallback(features: FeatureSupport): boolean {
  return !features.webgl2;
}
