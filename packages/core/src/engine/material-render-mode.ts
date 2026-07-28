import type { RenderMode } from '../types/context';

/**
 * Resolve one material's effective presentation mode.
 *
 * @param materialRenderMode - Optional per-material override.
 * @param contextRenderMode - Current owning-context default.
 * @returns The material override when present, otherwise the context default.
 */
export function resolveEffectiveMaterialRenderMode(
  materialRenderMode: RenderMode | undefined,
  contextRenderMode: RenderMode,
): RenderMode {
  return materialRenderMode ?? contextRenderMode;
}
