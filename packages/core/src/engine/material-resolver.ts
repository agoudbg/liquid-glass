import type { RendererMaterial } from '../renderer';
import type { CornerRadii } from '../types/common';
import type { MaterialConfig } from '../types/context';
import {
  normalizeCornerRadii,
  parseComputedCornerRadii,
  toShaderCornerRadii,
} from '../utils/radius';
import { parseCSSTransformMatrix } from '../utils/transforms';
import { validateOptionalFiniteNumber } from '../utils/validation';
import { orderMaterialRegistrations } from './material-order';
import { resolveMaterialVisibility } from './material-visibility';
import type { MaterialRegistration } from './registrations';
import type { GlassEngineRuntime } from './runtime';

function optionalNumber(
  value: number | undefined,
  field: string,
  fallback: number,
  minimum: number = 0,
): number {
  return validateOptionalFiniteNumber(value, field, { minimum }) ?? fallback;
}

function resolveRadii(
  config: MaterialConfig,
  style: CSSStyleDeclaration,
  width: number,
  height: number,
): CornerRadii {
  const computed = parseComputedCornerRadii(style, width, height);
  const base = config.radius === undefined
    ? undefined
    : optionalNumber(config.radius, 'material.radius', 0);

  return normalizeCornerRadii({
    topLeft: optionalNumber(
      config.radiusTL,
      'material.radiusTL',
      base ?? computed.topLeft,
    ),
    topRight: optionalNumber(
      config.radiusTR,
      'material.radiusTR',
      base ?? computed.topRight,
    ),
    bottomRight: optionalNumber(
      config.radiusBR,
      'material.radiusBR',
      base ?? computed.bottomRight,
    ),
    bottomLeft: optionalNumber(
      config.radiusBL,
      'material.radiusBL',
      base ?? computed.bottomLeft,
    ),
  }, width, height);
}

/**
 * Measure and resolve a public material registration for the WebGL renderer.
 *
 * @param id - Stable material identifier.
 * @param config - Current material configuration.
 * @param container - Exclusive boundary for ancestor visibility traversal.
 * @param containerRect - Owning context bounds in viewport coordinates.
 * @param runtime - Injected style-reading runtime.
 * @returns Renderer data, or `null` when the material is synchronously culled.
 */
export function resolveRendererMaterial(
  id: string,
  config: MaterialConfig,
  container: HTMLElement,
  containerRect: DOMRectReadOnly,
  runtime: GlassEngineRuntime,
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
  const radii = resolveRadii(config, style, logicalWidth, logicalHeight);

  return {
    id,
    rect: {
      x: rect.left - containerRect.left + (rect.width - logicalWidth) / 2,
      y: rect.top - containerRect.top + (rect.height - logicalHeight) / 2,
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
    radii: toShaderCornerRadii(radii),
    opacity,
    thickness: optionalNumber(config.thickness, 'material.thickness', 10),
    refractIndex: optionalNumber(
      config.refractIndex,
      'material.refractIndex',
      1.1,
      Number.EPSILON,
    ),
    refractIntensity: optionalNumber(
      config.refractIntensity,
      'material.refractIntensity',
      0.5,
    ),
    blur: optionalNumber(config.blur, 'material.blur', 0),
    dispersion: optionalNumber(config.dispersion, 'material.dispersion', 0.01),
  };
}

/** Measure every material registration in deterministic render order. */
export function resolveRendererMaterials(
  registrations: Iterable<MaterialRegistration>,
  container: HTMLElement,
  containerRect: DOMRectReadOnly,
  runtime: GlassEngineRuntime,
): RendererMaterial[] {
  return orderMaterialRegistrations(registrations, runtime)
    .map((registration) => resolveRendererMaterial(
      registration.id,
      registration.config,
      container,
      containerRect,
      runtime,
    ))
    .filter((material): material is RendererMaterial => material !== null);
}
