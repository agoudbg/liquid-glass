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
  if (
    options.renderMode !== undefined
    && options.renderMode !== 'uniform'
    && options.renderMode !== 'dedicated'
  ) {
    throw new GlassError(
      'INVALID_CONFIG',
      'Invalid liquid-glass context render mode.',
      { phase: 'configuration', details: { renderMode: options.renderMode } },
    );
  }

  return {
    ...options,
    renderMode: options.renderMode ?? 'uniform',
    themeColorThresholds: resolveThemeColorThresholds(
      options.themeColorThresholds,
    ),
  };
}
