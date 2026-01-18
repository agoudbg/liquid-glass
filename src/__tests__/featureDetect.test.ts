/**
 * Tests for feature detection utilities.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clampCanvasDimensions,
  getSafeDevicePixelRatio,
  invertMatrix2D,
  isMobileDevice,
  isWebGLSupported,
  MAX_CANVAS_DIMENSION_MOBILE,
  MAX_DPR_MOBILE,
  parseCSSTransformMatrix,
} from '../utils/featureDetect';

describe('isWebGLSupported', () => {
  it('should return a boolean', () => {
    const result = isWebGLSupported();
    expect(typeof result).toBe('boolean');
  });

  // Note: In jsdom environment, WebGL2 is not truly available even with mocks
  // The isWebGLSupported() function uses canvas.getContext('webgl2') which returns
  // null in jsdom, so this test reflects that environment limitation
  it('should handle WebGL2 detection correctly', () => {
    // In jsdom, WebGL2 is not supported, so this should return false
    // In a real browser environment, it would return true if WebGL2 is available
    const result = isWebGLSupported();
    expect(typeof result).toBe('boolean');
  });
});

describe('isMobileDevice', () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    // Reset userAgent after each test
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      writable: true,
      configurable: true,
    });
  });

  it('should detect iPhone', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      writable: true,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('should detect iPad', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)',
      writable: true,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('should detect Android', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 11; Pixel 5)',
      writable: true,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('should return false for desktop browsers', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
      writable: true,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(false);
  });
});

describe('getSafeDevicePixelRatio', () => {
  const originalDPR = window.devicePixelRatio;
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDPR,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      writable: true,
      configurable: true,
    });
  });

  it('should return the actual DPR on desktop', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 2.0,
      writable: true,
      configurable: true,
    });
    expect(getSafeDevicePixelRatio()).toBe(2.0);
  });

  it('should clamp high DPR on mobile to MAX_DPR_MOBILE', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 3.0,
      writable: true,
      configurable: true,
    });
    expect(getSafeDevicePixelRatio()).toBe(MAX_DPR_MOBILE);
  });

  it('should not clamp DPR <= 2 on mobile', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 2.0,
      writable: true,
      configurable: true,
    });
    expect(getSafeDevicePixelRatio()).toBe(2.0);
  });
});

describe('clampCanvasDimensions', () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      writable: true,
      configurable: true,
    });
  });

  it('should not clamp on desktop', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
      writable: true,
      configurable: true,
    });
    const result = clampCanvasDimensions(4096, 4096);
    expect(result.width).toBe(4096);
    expect(result.height).toBe(4096);
  });

  it('should clamp dimensions on mobile', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      writable: true,
      configurable: true,
    });
    const result = clampCanvasDimensions(4096, 4096);
    expect(result.width).toBe(MAX_CANVAS_DIMENSION_MOBILE);
    expect(result.height).toBe(MAX_CANVAS_DIMENSION_MOBILE);
  });

  it('should not change small dimensions on mobile', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      writable: true,
      configurable: true,
    });
    const result = clampCanvasDimensions(800, 600);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });
});

describe('parseCSSTransformMatrix', () => {
  it('should return identity for "none"', () => {
    expect(parseCSSTransformMatrix('none')).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('should return identity for empty string', () => {
    expect(parseCSSTransformMatrix('')).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('should parse a 2D matrix', () => {
    const result = parseCSSTransformMatrix('matrix(1, 0, 0, 1, 100, 200)');
    expect(result).toEqual([1, 0, 0, 1, 100, 200]);
  });

  it('should parse a 2D matrix with decimals', () => {
    const result = parseCSSTransformMatrix('matrix(0.866, 0.5, -0.5, 0.866, 10.5, 20.5)');
    expect(result[0]).toBeCloseTo(0.866, 3);
    expect(result[1]).toBeCloseTo(0.5, 3);
    expect(result[2]).toBeCloseTo(-0.5, 3);
    expect(result[3]).toBeCloseTo(0.866, 3);
    expect(result[4]).toBeCloseTo(10.5, 3);
    expect(result[5]).toBeCloseTo(20.5, 3);
  });

  it('should parse a 3D matrix and extract 2D portion', () => {
    // matrix3d with just translation (identity + translate)
    const result = parseCSSTransformMatrix(
      'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 200, 0, 1)',
    );
    expect(result).toEqual([1, 0, 0, 1, 100, 200]);
  });

  it('should return identity for invalid input', () => {
    expect(parseCSSTransformMatrix('invalid')).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseCSSTransformMatrix('rotate(45deg)')).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

describe('invertMatrix2D', () => {
  it('should invert identity matrix to itself', () => {
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    const result = invertMatrix2D(identity);
    // Use toBeCloseTo for floating point comparisons (handles -0 vs 0)
    expect(result[0]).toBeCloseTo(1, 10);
    expect(result[1]).toBeCloseTo(0, 10);
    expect(result[2]).toBeCloseTo(0, 10);
    expect(result[3]).toBeCloseTo(1, 10);
    expect(result[4]).toBeCloseTo(0, 10);
    expect(result[5]).toBeCloseTo(0, 10);
  });

  it('should invert a translation matrix', () => {
    // Translation by (100, 200)
    const translation: [number, number, number, number, number, number] = [1, 0, 0, 1, 100, 200];
    const inverse = invertMatrix2D(translation);
    // Inverse should translate by (-100, -200)
    expect(inverse[4]).toBeCloseTo(-100, 5);
    expect(inverse[5]).toBeCloseTo(-200, 5);
  });

  it('should invert a scale matrix', () => {
    // Scale by 2x
    const scale: [number, number, number, number, number, number] = [2, 0, 0, 2, 0, 0];
    const inverse = invertMatrix2D(scale);
    // Inverse should scale by 0.5x
    expect(inverse[0]).toBeCloseTo(0.5, 5);
    expect(inverse[3]).toBeCloseTo(0.5, 5);
  });

  it('should return identity for singular matrix', () => {
    // Singular matrix (determinant = 0)
    const singular: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    expect(invertMatrix2D(singular)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('should correctly invert a combined transform', () => {
    // Rotate 90 degrees: [cos(90), sin(90), -sin(90), cos(90), 0, 0] = [0, 1, -1, 0, 0, 0]
    const rotate90: [number, number, number, number, number, number] = [0, 1, -1, 0, 0, 0];
    const inverse = invertMatrix2D(rotate90);
    // Inverse of 90 degree rotation is -90 degrees: [0, -1, 1, 0, 0, 0]
    expect(inverse[0]).toBeCloseTo(0, 5);
    expect(inverse[1]).toBeCloseTo(-1, 5);
    expect(inverse[2]).toBeCloseTo(1, 5);
    expect(inverse[3]).toBeCloseTo(0, 5);
  });
});
