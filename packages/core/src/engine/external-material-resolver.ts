import type { RendererMaterial } from '../renderer';
import type { ExternalMaterialConfig } from '../types/external-material';
import { toShaderCornerRadii } from '../utils/radius';
import type { ContextViewportScale } from './context-coordinates';

/**
 * Resolve one viewport-positioned external material into target canvas space.
 *
 * @param id - Stable target-owned identifier.
 * @param config - Validated external material configuration.
 * @param containerRect - Target context bounds in viewport coordinates.
 * @param contentOffset - Scroll offset into full-content canvas coordinates.
 * @param viewportScale - Target container scale removed from viewport bounds.
 * @returns Renderer material data, or null when fully outside the target.
 */
export function resolveExternalRendererMaterial(
  id: string,
  config: ExternalMaterialConfig,
  containerRect: DOMRectReadOnly,
  contentOffset: { x: number; y: number },
  viewportScale: ContextViewportScale = { x: 1, y: 1 },
): RendererMaterial | null {
  const { clientRect, transform } = config;
  const safeScaleX = transform.scaleX === 0 ? 1 : transform.scaleX;
  const safeScaleY = transform.scaleY === 0 ? 1 : transform.scaleY;
  const localWidth = clientRect.width / viewportScale.x;
  const localHeight = clientRect.height / viewportScale.y;
  const naturalWidth = localWidth / safeScaleX;
  const naturalHeight = localHeight / safeScaleY;
  const scaleOffsetX = (localWidth - naturalWidth) / 2;
  const scaleOffsetY = (localHeight - naturalHeight) / 2;
  const relativeX = (
    (clientRect.x - containerRect.left) / viewportScale.x
    + scaleOffsetX
  );
  const relativeY = (
    (clientRect.y - containerRect.top) / viewportScale.y
    + scaleOffsetY
  );
  const visible = !(
    clientRect.x + clientRect.width <= containerRect.left
    || clientRect.y + clientRect.height <= containerRect.top
    || clientRect.x >= containerRect.right
    || clientRect.y >= containerRect.bottom
  );
  if (!visible) return null;

  return {
    id,
    rect: {
      x: relativeX + contentOffset.x,
      y: relativeY + contentOffset.y,
      width: naturalWidth,
      height: naturalHeight,
    },
    // Viewport bounds already include translation; retain only the linear scale.
    matrix: [
      transform.scaleX,
      0,
      0,
      transform.scaleY,
      0,
      0,
    ],
    radii: toShaderCornerRadii(config.borderRadius),
    opacity: 1,
    thickness: config.thickness,
    refractIndex: config.refractIndex,
    refractIntensity: config.refractIntensity,
    blur: config.blur,
    dispersion: config.dispersion,
  };
}
