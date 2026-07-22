import type { ScissorRect } from '../types/context';
import type { RendererMaterial } from './types';

/**
 * Calculate the legacy transformed material AABB in WebGL scissor coordinates.
 *
 * @param material - Resolved material data.
 * @param scale - CSS-to-device-pixel scale.
 * @param physicalHeight - Drawing-buffer height.
 * @param margin - Device-pixel guard against edge clipping.
 * @returns Integer device-pixel scissor rectangle.
 */
export function calculateMaterialScissor(
  material: RendererMaterial,
  scale: number,
  physicalHeight: number,
  margin: number = 2,
): ScissorRect {
  const [a, b, c, d, translateX, translateY] = material.matrix;
  const halfWidth = material.rect.width * scale / 2;
  const halfHeight = material.rect.height * scale / 2;
  const corners = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ] as const;
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of corners) {
    const transformedX = a * x + c * y;
    const transformedY = b * x + d * y;
    minimumX = Math.min(minimumX, transformedX);
    maximumX = Math.max(maximumX, transformedX);
    minimumY = Math.min(minimumY, transformedY);
    maximumY = Math.max(maximumY, transformedY);
  }

  const centerX = (
    material.rect.x + material.rect.width / 2 + translateX
  ) * scale;
  const centerY = (
    material.rect.y + material.rect.height / 2 + translateY
  ) * scale;
  const left = centerX + minimumX;
  const bottom = physicalHeight - centerY - maximumY;

  return {
    x: Math.floor(left - margin),
    y: Math.floor(bottom - margin),
    width: Math.ceil(maximumX - minimumX + margin * 2),
    height: Math.ceil(maximumY - minimumY + margin * 2),
  };
}
