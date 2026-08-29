import type { GlassEngineRuntime } from './runtime';

/** Resolve device pixel ratio and render precision into one safe scale. */
export function resolveContextDeviceScale(
  runtime: GlassEngineRuntime,
  precision: number,
): number {
  const ratio = runtime.devicePixelRatio();
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return safeRatio * precision;
}
