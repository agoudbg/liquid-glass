import { describe, expect, it } from 'vitest';

import {
  IDENTITY_MATRIX_2D,
  invertMatrix2D,
  parseCSSTransformMatrix,
  transformPoint2D,
} from '../../src/utils/transforms';

describe('transform utilities', () => {
  it('returns identity for absent or malformed transforms', () => {
    expect(parseCSSTransformMatrix('')).toEqual(IDENTITY_MATRIX_2D);
    expect(parseCSSTransformMatrix('none')).toEqual(IDENTITY_MATRIX_2D);
    expect(parseCSSTransformMatrix('translateX(10px)')).toEqual(IDENTITY_MATRIX_2D);
    expect(parseCSSTransformMatrix('matrix(1, nope, 0, 1, 0, 0)')).toEqual(IDENTITY_MATRIX_2D);
  });

  it('parses a CSS 2D matrix in browser component order', () => {
    expect(parseCSSTransformMatrix('matrix(1, 0.25, -0.5, 2, 12, -8)')).toEqual([
      1,
      0.25,
      -0.5,
      2,
      12,
      -8,
    ]);
  });

  it('extracts the two-dimensional portion of a column-major matrix3d', () => {
    expect(parseCSSTransformMatrix(
      'matrix3d(2, 3, 0, 0, 4, 5, 0, 0, 0, 0, 1, 0, 6, 7, 0, 1)',
    )).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('inverts an affine matrix and round-trips a point', () => {
    const matrix = parseCSSTransformMatrix('matrix(2, 0.5, -0.25, 3, 20, -10)');
    const transformed = transformPoint2D(matrix, 7, 11);
    const restored = transformPoint2D(invertMatrix2D(matrix), transformed.x, transformed.y);

    expect(restored.x).toBeCloseTo(7, 12);
    expect(restored.y).toBeCloseTo(11, 12);
  });

  it('returns identity for singular and near-singular matrices', () => {
    expect(invertMatrix2D([1, 2, 2, 4, 5, 6])).toEqual(IDENTITY_MATRIX_2D);
    expect(invertMatrix2D([1, 0, 0, 1e-12, 0, 0])).toEqual(IDENTITY_MATRIX_2D);
  });
});
