import { GlassError } from '../errors/GlassError';
import type { CornerRadii, RectLike } from '../types/common';
import type {
  ExternalMaterialConfig,
  ExternalMaterialTransform,
} from '../types/external-material';
import { validateFiniteNumber } from '../utils/validation';

type UnknownRecord = Record<string, unknown>;

const CONFIG_FIELDS = new Set([
  'clientRect',
  'borderRadius',
  'blur',
  'thickness',
  'refractIndex',
  'refractIntensity',
  'dispersion',
  'transform',
]);
const RECT_FIELDS = new Set(['x', 'y', 'width', 'height']);
const RADII_FIELDS = new Set([
  'topLeft',
  'topRight',
  'bottomRight',
  'bottomLeft',
]);
const TRANSFORM_FIELDS = new Set([
  'scaleX',
  'scaleY',
  'translateX',
  'translateY',
]);

function invalidExternal(field: string, value: unknown, reason: string): never {
  throw new GlassError(
    'INVALID_CONFIG',
    `Invalid external material configuration for "${field}": ${reason}.`,
    {
      phase: 'configuration',
      details: { field, value, reason },
    },
  );
}

function requireRecord(value: unknown, field: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidExternal(field, value, 'expected an object');
  }
  return value as UnknownRecord;
}

function assertKnownFields(
  value: UnknownRecord,
  fields: ReadonlySet<string>,
  field: string,
): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !fields.has(key)) {
      invalidExternal(field, key, 'contains an unknown field');
    }
  }
}

function readNumber(
  value: UnknownRecord,
  field: string,
  minimum?: number,
): number {
  if (!Object.prototype.hasOwnProperty.call(value, field)) {
    return invalidExternal(field, undefined, 'is required');
  }
  return validateFiniteNumber(
    value[field],
    `externalMaterial.${field}`,
    minimum === undefined ? {} : { minimum },
  );
}

function snapshotRect(value: unknown): RectLike {
  const record = requireRecord(value, 'clientRect');
  assertKnownFields(record, RECT_FIELDS, 'clientRect');
  return {
    x: readNumber(record, 'x'),
    y: readNumber(record, 'y'),
    width: readNumber(record, 'width', 0),
    height: readNumber(record, 'height', 0),
  };
}

function snapshotRadii(value: unknown): CornerRadii {
  const record = requireRecord(value, 'borderRadius');
  assertKnownFields(record, RADII_FIELDS, 'borderRadius');
  return {
    topLeft: readNumber(record, 'topLeft', 0),
    topRight: readNumber(record, 'topRight', 0),
    bottomRight: readNumber(record, 'bottomRight', 0),
    bottomLeft: readNumber(record, 'bottomLeft', 0),
  };
}

function snapshotTransform(value: unknown): ExternalMaterialTransform {
  const record = requireRecord(value, 'transform');
  assertKnownFields(record, TRANSFORM_FIELDS, 'transform');
  return {
    scaleX: readNumber(record, 'scaleX', 0),
    scaleY: readNumber(record, 'scaleY', 0),
    translateX: readNumber(record, 'translateX'),
    translateY: readNumber(record, 'translateY'),
  };
}

function configsEqual(
  left: ExternalMaterialConfig,
  right: ExternalMaterialConfig,
): boolean {
  return (
    left.clientRect.x === right.clientRect.x
    && left.clientRect.y === right.clientRect.y
    && left.clientRect.width === right.clientRect.width
    && left.clientRect.height === right.clientRect.height
    && left.borderRadius.topLeft === right.borderRadius.topLeft
    && left.borderRadius.topRight === right.borderRadius.topRight
    && left.borderRadius.bottomRight === right.borderRadius.bottomRight
    && left.borderRadius.bottomLeft === right.borderRadius.bottomLeft
    && left.blur === right.blur
    && left.thickness === right.thickness
    && left.refractIndex === right.refractIndex
    && left.refractIntensity === right.refractIntensity
    && left.dispersion === right.dispersion
    && left.transform.scaleX === right.transform.scaleX
    && left.transform.scaleY === right.transform.scaleY
    && left.transform.translateX === right.transform.translateX
    && left.transform.translateY === right.transform.translateY
  );
}

/** Validate and detach a complete external material configuration. */
export function snapshotExternalMaterialConfig(
  config: ExternalMaterialConfig,
): ExternalMaterialConfig {
  const record = requireRecord(config, 'external material');
  assertKnownFields(record, CONFIG_FIELDS, 'external material');
  return {
    clientRect: snapshotRect(record.clientRect),
    borderRadius: snapshotRadii(record.borderRadius),
    blur: readNumber(record, 'blur', 0),
    thickness: readNumber(record, 'thickness', 0),
    refractIndex: readNumber(record, 'refractIndex', Number.EPSILON),
    refractIntensity: readNumber(record, 'refractIntensity', 0),
    dispersion: readNumber(record, 'dispersion', 0),
    transform: snapshotTransform(record.transform),
  };
}

/**
 * Merge a partial external update into a detached complete configuration.
 *
 * @returns A changed snapshot, or null for a semantic no-op.
 */
export function prepareExternalMaterialUpdate(
  current: ExternalMaterialConfig,
  changes: Partial<ExternalMaterialConfig>,
): ExternalMaterialConfig | null {
  const record = requireRecord(changes, 'external material changes');
  assertKnownFields(record, CONFIG_FIELDS, 'external material changes');
  const candidate = snapshotExternalMaterialConfig({
    clientRect: Object.prototype.hasOwnProperty.call(record, 'clientRect')
      ? snapshotRect(record.clientRect)
      : current.clientRect,
    borderRadius: Object.prototype.hasOwnProperty.call(record, 'borderRadius')
      ? snapshotRadii(record.borderRadius)
      : current.borderRadius,
    blur: Object.prototype.hasOwnProperty.call(record, 'blur')
      ? readNumber(record, 'blur', 0)
      : current.blur,
    thickness: Object.prototype.hasOwnProperty.call(record, 'thickness')
      ? readNumber(record, 'thickness', 0)
      : current.thickness,
    refractIndex: Object.prototype.hasOwnProperty.call(record, 'refractIndex')
      ? readNumber(record, 'refractIndex', Number.EPSILON)
      : current.refractIndex,
    refractIntensity: Object.prototype.hasOwnProperty.call(
      record,
      'refractIntensity',
    )
      ? readNumber(record, 'refractIntensity', 0)
      : current.refractIntensity,
    dispersion: Object.prototype.hasOwnProperty.call(record, 'dispersion')
      ? readNumber(record, 'dispersion', 0)
      : current.dispersion,
    transform: Object.prototype.hasOwnProperty.call(record, 'transform')
      ? snapshotTransform(record.transform)
      : current.transform,
  });
  return configsEqual(current, candidate) ? null : candidate;
}
