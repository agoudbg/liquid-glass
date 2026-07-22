import { describe, expect, it } from 'vitest';

import {
  normalizeCornerRadii,
  parseComputedCornerRadii,
  parseCSSBorderRadius,
  resolveCornerRadii,
  toShaderCornerRadii,
} from '../../src/utils/radius';

describe('corner radius utilities', () => {
  it('parses pixels, percentages, and elliptical computed values', () => {
    expect(parseCSSBorderRadius('16px', 100, 50)).toBe(16);
    expect(parseCSSBorderRadius('50%', 100, 40)).toBe(20);
    expect(parseCSSBorderRadius('30px 12px', 100, 50)).toBe(12);
    expect(parseCSSBorderRadius('invalid', 100, 50)).toBe(0);
  });

  it('preserves explicit zero corner overrides', () => {
    expect(resolveCornerRadii(18, {
      topLeft: 0,
      bottomRight: 24,
    })).toEqual({
      topLeft: 0,
      topRight: 18,
      bottomRight: 24,
      bottomLeft: 18,
    });
  });

  it('uses one CSS-compatible scale when adjacent radii overlap', () => {
    expect(normalizeCornerRadii({
      topLeft: 80,
      topRight: 80,
      bottomRight: 20,
      bottomLeft: 20,
    }, 100, 100)).toEqual({
      topLeft: 50,
      topRight: 50,
      bottomRight: 12.5,
      bottomLeft: 12.5,
    });
  });

  it('parses and normalizes all computed corner fields', () => {
    expect(parseComputedCornerRadii({
      borderTopLeftRadius: '10px',
      borderTopRightRadius: '20px',
      borderBottomRightRadius: '30px',
      borderBottomLeftRadius: '40px',
    }, 200, 100)).toEqual({
      topLeft: 10,
      topRight: 20,
      bottomRight: 30,
      bottomLeft: 40,
    });
  });

  it('converts named corners to the legacy shader uniform order', () => {
    expect(toShaderCornerRadii({
      topLeft: 1,
      topRight: 2,
      bottomRight: 3,
      bottomLeft: 4,
    })).toEqual([2, 3, 4, 1]);
  });
});
