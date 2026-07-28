import { GlassError } from '../errors/GlassError';
import type {
  MaterialChanges,
  MaterialConfig,
  RenderMode,
} from '../types/context';
import type { InteractionPreset } from '../types/interaction';
import type { NumberValidationOptions } from '../utils/validation';
import { validateFiniteNumber } from '../utils/validation';
import {
  cloneMaterialInteractionConfig,
  materialInteractionConfigsEqual,
  snapshotMaterialInteractionConfig,
} from './material-interaction-config';

type UnknownRecord = Record<string, unknown>;

const INTERACTION_PRESETS = [
  'button',
  'context-menu',
  'slider',
  'custom',
] as const satisfies readonly InteractionPreset[];

const MATERIAL_OPTION_FIELDS = [
  'radius',
  'radiusTR',
  'radiusBR',
  'radiusBL',
  'radiusTL',
  'thickness',
  'refractIndex',
  'refractIntensity',
  'blur',
  'dispersion',
  'disableInteractions',
  'onlyClickInteractions',
  'isMoveable',
  'interactionPreset',
  'interactionConfig',
  'renderMode',
  'renderOrder',
  'proxyTarget',
] as const satisfies readonly (keyof MaterialChanges)[];

const MATERIAL_FIELDS = ['element', ...MATERIAL_OPTION_FIELDS] as const;
const MATERIAL_FIELD_SET = new Set<string>(MATERIAL_FIELDS);
const MATERIAL_CHANGE_FIELD_SET = new Set<string>(MATERIAL_OPTION_FIELDS);

/** A validated material update ready for a synchronous commit. */
export interface PreparedMaterialUpdate {
  /** Detached event payload retaining owned undefined clear operations. */
  changes: MaterialChanges;
  /** Detached canonical configuration that becomes the new internal state. */
  next: MaterialConfig;
}

function invalidMaterial(field: string, value: unknown, reason: string): never {
  throw new GlassError(
    'INVALID_CONFIG',
    `Invalid material configuration for "${field}": ${reason}.`,
    {
      phase: 'configuration',
      details: { field, value, reason },
    },
  );
}

function hasOwn(record: UnknownRecord, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function requireRecord(value: unknown, field: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidMaterial(field, value, 'expected an object');
  }
  return value as UnknownRecord;
}

function assertKnownFields(
  record: UnknownRecord,
  fields: ReadonlySet<string>,
  field: string,
): void {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !fields.has(key)) {
      invalidMaterial(field, key, 'contains an unknown field');
    }
  }
}

function requireElement(value: unknown): HTMLElement {
  if (typeof value !== 'object' || value === null) {
    return invalidMaterial('material.element', value, 'expected an HTML element');
  }
  const candidate = value as UnknownRecord;
  const requiredMethods = [
    'getAttribute',
    'setAttribute',
    'removeAttribute',
    'getBoundingClientRect',
  ] as const;
  for (const method of requiredMethods) {
    if (typeof candidate[method] !== 'function') {
      return invalidMaterial(
        'material.element',
        value,
        `expected an HTML element with ${method}()`,
      );
    }
  }
  return value as HTMLElement;
}

function copyNumber(
  source: UnknownRecord,
  target: UnknownRecord,
  field: string,
  options: NumberValidationOptions,
  retainUndefined: boolean,
): void {
  if (!hasOwn(source, field)) return;
  const value = source[field];
  if (value === undefined) {
    if (retainUndefined) target[field] = undefined;
    return;
  }
  target[field] = validateFiniteNumber(
    value,
    `material.${field}`,
    options,
  );
}

function copyBoolean(
  source: UnknownRecord,
  target: UnknownRecord,
  field: string,
  retainUndefined: boolean,
): void {
  if (!hasOwn(source, field)) return;
  const value = source[field];
  if (value === undefined) {
    if (retainUndefined) target[field] = undefined;
    return;
  }
  if (typeof value !== 'boolean') {
    invalidMaterial(`material.${field}`, value, 'expected a boolean');
  }
  target[field] = value;
}

function copyInteractionPreset(
  source: UnknownRecord,
  target: UnknownRecord,
  retainUndefined: boolean,
): void {
  if (!hasOwn(source, 'interactionPreset')) return;
  const value = source.interactionPreset;
  if (value === undefined) {
    if (retainUndefined) target.interactionPreset = undefined;
    return;
  }
  if (
    typeof value !== 'string'
    || !INTERACTION_PRESETS.includes(value as InteractionPreset)
  ) {
    invalidMaterial(
      'material.interactionPreset',
      value,
      'expected a supported interaction preset',
    );
  }
  target.interactionPreset = value;
}

function copyInteractionConfig(
  source: UnknownRecord,
  target: UnknownRecord,
  retainUndefined: boolean,
): void {
  if (!hasOwn(source, 'interactionConfig')) return;
  const value = source.interactionConfig;
  if (value === undefined) {
    if (retainUndefined) target.interactionConfig = undefined;
    return;
  }
  target.interactionConfig = snapshotMaterialInteractionConfig(value);
}

function copyRenderMode(
  source: UnknownRecord,
  target: UnknownRecord,
  retainUndefined: boolean,
): void {
  if (!hasOwn(source, 'renderMode')) return;
  const value = source.renderMode;
  if (value === undefined) {
    if (retainUndefined) target.renderMode = undefined;
    return;
  }
  if (value !== 'uniform' && value !== 'dedicated') {
    invalidMaterial(
      'material.renderMode',
      value,
      'expected a supported render mode',
    );
  }
  target.renderMode = value satisfies RenderMode;
}

function copyProxyTarget(
  source: UnknownRecord,
  target: UnknownRecord,
  retainUndefined: boolean,
): void {
  if (!hasOwn(source, 'proxyTarget')) return;
  const value = source.proxyTarget;
  if (value === undefined) {
    if (retainUndefined) target.proxyTarget = undefined;
    return;
  }
  throw new GlassError(
    'INVALID_CONFIG',
    'External material delegation is introduced in rewrite phase P6.',
    {
      phase: 'configuration',
      details: { proxyTarget: value },
    },
  );
}

function snapshotOptions(
  source: UnknownRecord,
  retainUndefined: boolean,
): UnknownRecord {
  const target: UnknownRecord = {};
  copyNumber(source, target, 'radius', { minimum: 0 }, retainUndefined);
  copyNumber(source, target, 'radiusTR', { minimum: 0 }, retainUndefined);
  copyNumber(source, target, 'radiusBR', { minimum: 0 }, retainUndefined);
  copyNumber(source, target, 'radiusBL', { minimum: 0 }, retainUndefined);
  copyNumber(source, target, 'radiusTL', { minimum: 0 }, retainUndefined);
  copyNumber(source, target, 'thickness', { minimum: 0 }, retainUndefined);
  copyNumber(source, target, 'refractIndex', {
    minimum: Number.EPSILON,
  }, retainUndefined);
  copyNumber(source, target, 'refractIntensity', { minimum: 0 }, retainUndefined);
  copyNumber(source, target, 'blur', { minimum: 0 }, retainUndefined);
  copyNumber(source, target, 'dispersion', { minimum: 0 }, retainUndefined);
  copyBoolean(source, target, 'disableInteractions', retainUndefined);
  copyBoolean(source, target, 'onlyClickInteractions', retainUndefined);
  copyBoolean(source, target, 'isMoveable', retainUndefined);
  copyInteractionPreset(source, target, retainUndefined);
  copyInteractionConfig(source, target, retainUndefined);
  copyRenderMode(source, target, retainUndefined);
  copyNumber(source, target, 'renderOrder', {}, retainUndefined);
  copyProxyTarget(source, target, retainUndefined);
  return target;
}

/** Validate and canonicalize a consumer-owned material configuration. */
export function snapshotMaterialConfig(config: MaterialConfig): MaterialConfig {
  const source = requireRecord(config, 'material');
  assertKnownFields(source, MATERIAL_FIELD_SET, 'material');
  if (!hasOwn(source, 'element')) {
    return invalidMaterial('material.element', undefined, 'expected an HTML element');
  }
  return {
    element: requireElement(source.element),
    ...snapshotOptions(source, false),
  } as MaterialConfig;
}

/** Return a detached clone of one validated canonical material configuration. */
export function cloneMaterialConfig(config: MaterialConfig): MaterialConfig {
  return snapshotMaterialConfig(config);
}

function snapshotMaterialChanges(changes: MaterialChanges): MaterialChanges {
  const source = requireRecord(changes, 'material changes');
  if (hasOwn(source, 'element')) {
    invalidMaterial(
      'material.element',
      source.element,
      'cannot replace a registered material element',
    );
  }
  assertKnownFields(source, MATERIAL_CHANGE_FIELD_SET, 'material changes');
  return snapshotOptions(source, true) as MaterialChanges;
}

function materialConfigsEqual(left: MaterialConfig, right: MaterialConfig): boolean {
  if (left.element !== right.element) return false;
  const leftRecord = left as unknown as UnknownRecord;
  const rightRecord = right as unknown as UnknownRecord;
  for (const field of MATERIAL_OPTION_FIELDS) {
    const leftOwns = hasOwn(leftRecord, field);
    const rightOwns = hasOwn(rightRecord, field);
    if (leftOwns !== rightOwns) return false;
    if (!leftOwns) continue;
    if (field === 'interactionConfig') {
      if (!materialInteractionConfigsEqual(
        left.interactionConfig,
        right.interactionConfig,
      )) {
        return false;
      }
    } else if (leftRecord[field] !== rightRecord[field]) {
      return false;
    }
  }
  return true;
}

/**
 * Validate an update and build isolated event and internal snapshots.
 *
 * A null result means the canonical configuration is unchanged.
 */
export function prepareMaterialUpdate(
  current: MaterialConfig,
  changes: MaterialChanges,
): PreparedMaterialUpdate | null {
  const eventChanges = snapshotMaterialChanges(changes);
  const candidate = cloneMaterialConfig(current) as unknown as UnknownRecord;
  const changeRecord = eventChanges as UnknownRecord;
  for (const field of MATERIAL_OPTION_FIELDS) {
    if (!hasOwn(changeRecord, field)) continue;
    const value = changeRecord[field];
    if (value === undefined) {
      delete candidate[field];
    } else if (field === 'interactionConfig') {
      candidate[field] = cloneMaterialInteractionConfig(
        value as NonNullable<MaterialConfig['interactionConfig']>,
      );
    } else {
      candidate[field] = value;
    }
  }
  const next = snapshotMaterialConfig(candidate as unknown as MaterialConfig);
  return materialConfigsEqual(current, next)
    ? null
    : { changes: eventChanges, next };
}
