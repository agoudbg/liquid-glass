import { describe, expect, it, vi } from 'vitest';

import {
  clampCanvasDimensions,
  detectFeatures,
  getSafeDevicePixelRatio,
  isMobileDevice,
  isWebGLSupported,
  MAX_CANVAS_DIMENSION_MOBILE,
  MAX_DPR_MOBILE,
  requiresFallback,
} from '../../src/utils/feature-detect';

function createDocument(getContextResult: object | null): Pick<Document, 'createElement'> {
  return {
    createElement: vi.fn(() => ({
      getContext: vi.fn(() => getContextResult),
    })),
  } as unknown as Pick<Document, 'createElement'>;
}

describe('feature detection', () => {
  it('requires both constructor exposure and successful context creation', () => {
    const document = createDocument({ getExtension: vi.fn(() => null) });
    expect(isWebGLSupported({ document, hasWebGL2Constructor: false })).toBe(false);
    expect(isWebGLSupported({ document, hasWebGL2Constructor: true })).toBe(true);
    expect(isWebGLSupported({
      document: createDocument(null),
      hasWebGL2Constructor: true,
    })).toBe(false);
  });

  it('releases the temporary WebGL2 context used for capability probing', () => {
    const loseContext = vi.fn();
    const document = createDocument({
      getExtension: vi.fn(() => ({ loseContext })),
    });

    expect(isWebGLSupported({ document, hasWebGL2Constructor: true })).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('returns false when context probing throws', () => {
    const document = {
      createElement: (): never => {
        throw new Error('canvas blocked');
      },
    } as unknown as Pick<Document, 'createElement'>;
    expect(isWebGLSupported({ document, hasWebGL2Constructor: true })).toBe(false);
  });

  it('keeps the reference mobile classifier', () => {
    expect(isMobileDevice({ userAgent: 'Mozilla/5.0 (iPhone)' })).toBe(true);
    expect(isMobileDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' })).toBe(true);
    expect(isMobileDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toBe(false);
  });

  it('uses the exact mobile DPR cutoff and clamp from the reference', () => {
    const mobile = { userAgent: 'iPhone' };
    expect(getSafeDevicePixelRatio({ ...mobile, devicePixelRatio: 2 })).toBe(2);
    expect(getSafeDevicePixelRatio({ ...mobile, devicePixelRatio: 3 })).toBe(MAX_DPR_MOBILE);
    expect(getSafeDevicePixelRatio({
      userAgent: 'Windows',
      devicePixelRatio: 3,
    })).toBe(3);
  });

  it('clamps mobile dimensions independently and leaves desktop unchanged', () => {
    expect(clampCanvasDimensions(4096, 1024, { userAgent: 'Android' })).toEqual({
      width: MAX_CANVAS_DIMENSION_MOBILE,
      height: 1024,
    });
    expect(clampCanvasDimensions(4096, 3072, { userAgent: 'Windows' })).toEqual({
      width: 4096,
      height: 3072,
    });
  });

  it('returns a complete deterministic capability snapshot', () => {
    const features = detectFeatures({
      document: createDocument(null),
      userAgent: 'Android',
      devicePixelRatio: 3,
      hasWebGL2Constructor: true,
      hasOffscreenCanvas: true,
      hasResizeObserver: true,
      hasMutationObserver: false,
      hasIntersectionObserver: true,
      hasCssBackdropFilter: true,
    });

    expect(features).toEqual({
      webgl2: false,
      offscreenCanvas: true,
      resizeObserver: true,
      mutationObserver: false,
      intersectionObserver: true,
      cssBackdropFilter: true,
      mobile: true,
      devicePixelRatio: MAX_DPR_MOBILE,
    });
    expect(requiresFallback(features)).toBe(true);
  });
});
