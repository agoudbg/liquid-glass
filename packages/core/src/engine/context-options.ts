import { GlassError } from '../errors/GlassError';
import type { GlassContextOptions } from '../types/context';
import { validateFiniteNumber } from '../utils/validation';
import {
  type ResolvedThemeColorThresholds,
  resolveThemeColorThresholds,
} from './backdrop-theme';

type UnknownRecord = Record<PropertyKey, unknown>;

const CONTEXT_OPTION_FIELDS = new Set<PropertyKey>([
  'canvasZIndex',
  'debug',
  'enableBlurredEffect',
  'enableFallback',
  'renderMode',
  'renderPrecision',
  'scrollable',
  'themeColorThresholds',
]);
const THEME_THRESHOLD_FIELDS = new Set<PropertyKey>([
  'darkMax',
  'ultraDarkMax',
  'ultraLightMin',
]);

function invalidContextOption(field: string, value: unknown, reason: string): never {
  throw new GlassError(
    'INVALID_CONFIG',
    `Invalid liquid-glass context option for "${field}": ${reason}.`,
    {
      phase: 'configuration',
      details: { field, value, reason },
    },
  );
}

function requirePlainRecord(value: unknown, field: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidContextOption(field, value, 'expected a plain object');
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return invalidContextOption(field, value, 'expected a plain object');
  }
  return value as UnknownRecord;
}

function assertKnownFields(
  source: UnknownRecord,
  fields: ReadonlySet<PropertyKey>,
  field: string,
): void {
  for (const key of Reflect.ownKeys(source)) {
    if (!fields.has(key)) {
      invalidContextOption(field, key, 'contains an unknown field');
    }
  }
}

function copyBoolean(
  source: UnknownRecord,
  target: GlassContextOptions,
  field: 'debug' | 'enableBlurredEffect' | 'enableFallback' | 'scrollable',
): void {
  const value = source[field];
  if (value === undefined) return;
  if (typeof value !== 'boolean') {
    invalidContextOption(`context.${field}`, value, 'expected a boolean');
  }
  target[field] = value;
}

function copyRenderPrecision(
  source: UnknownRecord,
  target: GlassContextOptions,
): void {
  const value = source.renderPrecision;
  if (value === undefined) return;
  if (typeof value !== 'number') {
    invalidContextOption('context.renderPrecision', value, 'expected a number');
  }
  target.renderPrecision = value;
}

function resolveContextThemeThresholds(
  source: UnknownRecord,
): ResolvedThemeColorThresholds {
  const value = source.themeColorThresholds;
  if (value === undefined) return resolveThemeColorThresholds(undefined);
  const thresholds = requirePlainRecord(value, 'context.themeColorThresholds');
  assertKnownFields(
    thresholds,
    THEME_THRESHOLD_FIELDS,
    'context.themeColorThresholds',
  );
  return resolveThemeColorThresholds(
    thresholds as unknown as NonNullable<GlassContextOptions['themeColorThresholds']>,
  );
}

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
  const source = requirePlainRecord(options, 'context');
  assertKnownFields(source, CONTEXT_OPTION_FIELDS, 'context');
  if (
    source.renderMode !== undefined
    && source.renderMode !== 'uniform'
    && source.renderMode !== 'dedicated'
  ) {
    invalidContextOption(
      'context.renderMode',
      source.renderMode,
      'expected "uniform" or "dedicated"',
    );
  }

  const snapshot: GlassContextOptions = {
    renderMode: source.renderMode ?? 'uniform',
    themeColorThresholds: resolveContextThemeThresholds(source),
  };
  copyBoolean(source, snapshot, 'debug');
  copyBoolean(source, snapshot, 'enableBlurredEffect');
  copyBoolean(source, snapshot, 'enableFallback');
  copyBoolean(source, snapshot, 'scrollable');
  copyRenderPrecision(source, snapshot);
  if (source.canvasZIndex !== undefined) {
    snapshot.canvasZIndex = validateFiniteNumber(
      source.canvasZIndex,
      'context.canvasZIndex',
    );
  }
  return snapshot;
}
