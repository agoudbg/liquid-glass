import type { MaterialConfig, MaterialPresentationState } from '../types/context';
import type { ExternalMaterialConfig } from '../types/external-material';
import { resolveMaterialGlassValues } from './material-glass-values';
import type { GlassEngineRuntime } from './runtime';

/** Build the complete target-side snapshot for one delegated material. */
export function buildExternalMaterialConfig(
  config: MaterialConfig,
  presentation: MaterialPresentationState,
  runtime: GlassEngineRuntime,
): ExternalMaterialConfig {
  const rect = config.element.getBoundingClientRect();
  const logicalWidth = config.element.offsetWidth > 0
    ? config.element.offsetWidth
    : rect.width;
  const logicalHeight = config.element.offsetHeight > 0
    ? config.element.offsetHeight
    : rect.height;
  const glass = resolveMaterialGlassValues(
    config,
    runtime.getComputedStyle(config.element),
    logicalWidth,
    logicalHeight,
  );
  const output = presentation.interactionOutput;

  return {
    clientRect: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    },
    borderRadius: { ...glass.borderRadius },
    blur: glass.blur,
    thickness: glass.thickness,
    refractIndex: glass.refractIndex,
    refractIntensity: glass.refractIntensity,
    dispersion: glass.dispersion,
    transform: {
      scaleX: output.scaleX,
      scaleY: output.scaleY,
      translateX: output.translateX,
      translateY: output.translateY,
    },
  };
}

/** Match the legacy half-pixel threshold used by continuous proxy position sync. */
export function delegatedLayoutChanged(
  previous: ExternalMaterialConfig,
  next: ExternalMaterialConfig,
): boolean {
  const threshold = 0.5;
  return (
    Math.abs(next.clientRect.x - previous.clientRect.x) > threshold
    || Math.abs(next.clientRect.y - previous.clientRect.y) > threshold
    || Math.abs(next.clientRect.width - previous.clientRect.width) > threshold
    || Math.abs(next.clientRect.height - previous.clientRect.height) > threshold
  );
}
