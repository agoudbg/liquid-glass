import type { Matrix2D } from '../types/common';

/**
 * Identity transform used when CSS transform parsing or inversion is impossible.
 */
export const IDENTITY_MATRIX_2D: Matrix2D = [1, 0, 0, 1, 0, 0];

/**
 * Parse a computed CSS `matrix()` or `matrix3d()` string into a 2D matrix.
 *
 * The extraction and failure behavior match the reference implementation.
 *
 * @param transformString - Computed CSS transform value.
 * @returns Parsed matrix or the identity matrix when parsing fails.
 */
export function parseCSSTransformMatrix(transformString: string): Matrix2D {
  if (!transformString || transformString === 'none') {
    return IDENTITY_MATRIX_2D;
  }

  const matrix2dMatch = transformString.match(
    /^matrix\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\s*\)$/,
  );
  if (matrix2dMatch) {
    const values = matrix2dMatch.slice(1).map(Number);
    if (values.every((value) => !Number.isNaN(value))) {
      return [values[0], values[1], values[2], values[3], values[4], values[5]];
    }
  }

  const matrix3dMatch = transformString.match(/^matrix3d\((.+)\)$/);
  if (matrix3dMatch) {
    const values = matrix3dMatch[1]
      .split(',')
      .map((value) => Number.parseFloat(value.trim()));
    if (values.length >= 16 && values.every((value) => !Number.isNaN(value))) {
      return [values[0], values[1], values[4], values[5], values[12], values[13]];
    }
  }

  return IDENTITY_MATRIX_2D;
}

/**
 * Invert a two-dimensional affine transform.
 *
 * @param matrix - Matrix in CSS `matrix(a, b, c, d, e, f)` order.
 * @returns Inverse matrix, or identity when the determinant is effectively zero.
 */
export function invertMatrix2D(matrix: Matrix2D): Matrix2D {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;

  if (Math.abs(determinant) < 1e-10) {
    return IDENTITY_MATRIX_2D;
  }

  const inverseDeterminant = 1 / determinant;
  return [
    d * inverseDeterminant,
    -b * inverseDeterminant,
    -c * inverseDeterminant,
    a * inverseDeterminant,
    (c * f - d * e) * inverseDeterminant,
    (b * e - a * f) * inverseDeterminant,
  ];
}

/**
 * Apply a two-dimensional affine transform to one point.
 *
 * @param matrix - Matrix in CSS component order.
 * @param x - Horizontal point coordinate.
 * @param y - Vertical point coordinate.
 * @returns Transformed point.
 */
export function transformPoint2D(
  matrix: Matrix2D,
  x: number,
  y: number,
): { x: number; y: number } {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: a * x + c * y + e,
    y: b * x + d * y + f,
  };
}
