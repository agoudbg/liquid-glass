import { GlassError } from '../errors/GlassError';
import type { GlassContextOptions } from '../types/context';
import { resolveThemeColorThresholds } from './backdrop-theme';

/** Resolve the renderer precision while rejecting unusable numeric values. */
export function resolveContextPrecision(options: GlassContextOptions): number {
  const precision = options.renderPrecision;
  return precision === undefined || precision === 0 || !Number.isFinite(precision)
    ? 1
    : Math.max(0.05, precision);
}

/** Copy and normalize mutable context options at the public API boundary. */
export function snapshotContextOptions(
  options: GlassContextOptions,
): GlassContextOptions {
  if (options.renderMode === 'dedicated') {
    throw new GlassError(
      'INVALID_CONFIG',
      'Dedicated per-material canvases are introduced after the P3 uniform slice.',
      { phase: 'configuration', details: { renderMode: options.renderMode } },
    );
  }

  return {
    ...options,
    renderMode: 'uniform',
    themeColorThresholds: resolveThemeColorThresholds(
      options.themeColorThresholds,
    ),
  };
}
