import { describe, expect, it } from 'vitest';

import { GlassError } from '../../src/errors/GlassError';
import {
  clampFiniteNumber,
  validateFiniteNumber,
  validateNonNegativeNumber,
  validateOptionalFiniteNumber,
} from '../../src/utils/validation';

describe('numeric validation', () => {
  it('accepts finite values including an explicit zero', () => {
    expect(validateFiniteNumber(0, 'refractIntensity', { minimum: 0 })).toBe(0);
    expect(validateOptionalFiniteNumber(undefined, 'blur')).toBeUndefined();
    expect(validateNonNegativeNumber(0.02, 'dispersion')).toBe(0.02);
  });

  it.each([NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '1', null])(
    'rejects non-finite or non-number input %s',
    (value) => {
      expect(() => validateFiniteNumber(value, 'thickness')).toThrow(GlassError);
    },
  );

  it('enforces inclusive, exclusive, and integer constraints', () => {
    expect(() => validateFiniteNumber(1, 'ior', {
      minimum: 1,
      exclusiveMinimum: true,
    })).toThrow(/greater than 1/);
    expect(() => validateFiniteNumber(1.5, 'samples', { integer: true })).toThrow(/integer/);
    expect(validateFiniteNumber(255, 'luma', { minimum: 0, maximum: 255 })).toBe(255);
  });

  it('rejects reversed constraints with contextual details', () => {
    expect(() => validateFiniteNumber(5, 'radius', {
      minimum: 10,
      maximum: 2,
    })).toThrow(/minimum exceeds maximum/);
  });

  it.each([
    { minimum: NaN },
    { minimum: Number.NEGATIVE_INFINITY },
    { maximum: NaN },
    { maximum: Number.POSITIVE_INFINITY },
  ])('rejects non-finite constraints: %o', (options) => {
    expect(() => validateFiniteNumber(5, 'radius', options)).toThrow(
      /constraint must be finite/,
    );
  });

  it('clamps finite values after validating both bounds', () => {
    expect(clampFiniteNumber(-5, 0, 10)).toBe(0);
    expect(clampFiniteNumber(12, 0, 10)).toBe(10);
    expect(clampFiniteNumber(6, 0, 10)).toBe(6);
    expect(() => clampFiniteNumber(1, 10, 0)).toThrow(GlassError);
  });
});
