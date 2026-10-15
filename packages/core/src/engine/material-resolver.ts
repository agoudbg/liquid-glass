import type { RendererMaterial } from '../renderer';
import type { MaterialConfig } from '../types/context';
import { toShaderCornerRadii } from '../utils/radius';
import { parseCSSTransformMatrix } from '../utils/transforms';
import { type ContextViewportScale, resolveContextViewportScale } from './context-coordinates';
import { resolveMaterialGlassValues } from './material-glass-values';
import { orderMaterialRegistrations } from './material-order';
import { resolveMaterialVisibility } from './material-visibility';
import type { MaterialRegistration } from './registrations';
import type { GlassEngineRuntime } from './runtime';

/**
 * Measure and resolve a public material registration for the WebGL renderer.
 *
 * @param id - Stable material identifier.
 * @param config - Current material configuration.
 * @param container - Exclusive boundary for ancestor visibility traversal.
 * @param containerRect - Owning context bounds in viewport coordinates.
 * @param runtime - Injected style-reading runtime.
 * @param contentOffset - Scroll offset into full-content presentation coordinates.
 * @param viewportScale - Effective container scale used to undo viewport measurements.
 * @returns Renderer data, or `null` when the material is synchronously culled.
 */
export function resolveRendererMaterial(
  id: string,
  config: MaterialConfig,
  container: HTMLElement,
  containerRect: DOMRectReadOnly,
  runtime: GlassEngineRuntime,
  contentOffset: { x: number; y: number } = { x: 0, y: 0 },
  viewportScale: ContextViewportScale = resolveContextViewportScale(container, containerRect),
): RendererMaterial | null {
  const visibility = resolveMaterialVisibility(
    config.element,
    container,
    containerRect,
    runtime,
  );
  if (!visibility.visible) {
    return null;
  }
  const { opacity, rect, style } = visibility;
  const logicalWidth = config.element.offsetWidth > 0
    ? config.element.offsetWidth
    : rect.width;
  const logicalHeight = config.element.offsetHeight > 0
    ? config.element.offsetHeight
    : rect.height;
  const parsedMatrix = parseCSSTransformMatrix(style.transform);
  const glass = resolveMaterialGlassValues(
    config,
    style,
    logicalWidth,
    logicalHeight,
  );

  return {
    id,
    rect: {
      x: (
        (rect.left - containerRect.left) / viewportScale.x
        + (rect.width / viewportScale.x - logicalWidth) / 2
        + contentOffset.x
      ),
      y: (
        (rect.top - containerRect.top) / viewportScale.y
        + (rect.height / viewportScale.y - logicalHeight) / 2
        + contentOffset.y
      ),
      width: logicalWidth,
      height: logicalHeight,
    },
    // BoundingClientRect already includes CSS translation; retain only linear terms.
    matrix: [
      parsedMatrix[0],
      parsedMatrix[1],
      parsedMatrix[2],
      parsedMatrix[3],
      0,
      0,
    ],
    radii: toShaderCornerRadii(glass.borderRadius),
    opacity,
    thickness: glass.thickness,
    refractIndex: glass.refractIndex,
    refractIntensity: glass.refractIntensity,
    blur: glass.blur,
    dispersion: glass.dispersion,
  };
}

/** Measure every material registration in deterministic render order. */
export function resolveRendererMaterials(
  registrations: Iterable<MaterialRegistration>,
  container: HTMLElement,
  containerRect: DOMRectReadOnly,
  runtime: GlassEngineRuntime,
  contentOffset: { x: number; y: number } = { x: 0, y: 0 },
): RendererMaterial[] {
  const viewportScale = resolveContextViewportScale(container, containerRect);
  return orderMaterialRegistrations(registrations, runtime)
    .map((registration) => resolveRendererMaterial(
      registration.id,
      registration.config,
      container,
      containerRect,
      runtime,
      contentOffset,
      viewportScale,
    ))
    .filter((material): material is RendererMaterial => material !== null);
}
