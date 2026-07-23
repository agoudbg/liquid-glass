import { GlassError } from '../errors/GlassError';
import type {
  InteractionPreset,
  PartialInteractionConfig,
  SpringConfig,
} from '../types/interaction';
import type { NumberValidationOptions } from '../utils/validation';
import { validateFiniteNumber } from '../utils/validation';

type UnknownRecord = Record<string, unknown>;

const INTERACTION_PRESETS = [
  'button',
  'context-menu',
  'slider',
  'custom',
] as const satisfies readonly InteractionPreset[];

const INTERACTION_FIELDS = [
  'preset',
  'baseScale',
  'hoverScale',
  'activeScale',
  'maxScale',
  'enableHoverFollow',
  'hoverFollowFactor',
  'hoverFollowMaxDistance',
  'translateFactor',
  'maxTranslate',
  'maxTranslateY',
  'stretchFactor',
  'stretchLimit',
  'preserveArea',
  'velocityStretch',
  'velocityStretchFactor',
  'ignorePointerPosition',
  'enableOriginShift',
  'originShiftSensitivity',
  'enableIdleReturn',
  'idleReturnDelay',
  'idleReturnPartial',
  'idleReturnRatio',
  'keepScaleOnIdleReturn',
  'useAbsoluteValues',
  'hoverSpring',
  'activeSpring',
  'releaseSpring',
  'showHighlight',
  'highlightSize',
  'highlightOpacity',
  'highlightHDRFactor',
  'highlightFollowSpeed',
  'activeOpacity',
  'enableOpacityTransition',
  'activeBackgroundColor',
  'enableBackgroundTransition',
  'restThreshold',
  'velocityThreshold',
] as const satisfies readonly (keyof PartialInteractionConfig)[];

const INTERACTION_FIELD_SET = new Set<string>(INTERACTION_FIELDS);
const SPRING_FIELDS = ['stiffness', 'damping', 'mass'] as const;

function invalidInteraction(
  field: string,
  value: unknown,
  reason: string,
): never {
  throw new GlassError(
    'INVALID_CONFIG',
    `Invalid interaction configuration for "${field}": ${reason}.`,
    {
      phase: 'configuration',
      details: { field, value, reason },
    },
  );
}

function hasOwn(record: UnknownRecord, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function requirePlainRecord(value: unknown, field: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidInteraction(field, value, 'expected a plain object');
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return invalidInteraction(field, value, 'expected a plain object');
  }
  return value as UnknownRecord;
}

function assertKnownFields(record: UnknownRecord): void {
  for (const field of Reflect.ownKeys(record)) {
    if (typeof field !== 'string' || !INTERACTION_FIELD_SET.has(field)) {
      invalidInteraction(
        'material.interactionConfig',
        field,
        'contains an unknown field',
      );
    }
  }
}

function copyNumber(
  source: UnknownRecord,
  target: UnknownRecord,
  field: string,
  options: NumberValidationOptions = {},
  preserveUndefined = false,
): void {
  if (!hasOwn(source, field)) return;
  const value = source[field];
  if (value === undefined) {
    if (preserveUndefined) target[field] = undefined;
    return;
  }
  target[field] = validateFiniteNumber(
    value,
    `material.interactionConfig.${field}`,
    options,
  );
}

function copyBoolean(
  source: UnknownRecord,
  target: UnknownRecord,
  field: string,
  preserveUndefined = false,
): void {
  if (!hasOwn(source, field)) return;
  const value = source[field];
  if (value === undefined) {
    if (preserveUndefined) target[field] = undefined;
    return;
  }
  if (typeof value !== 'boolean') {
    invalidInteraction(
      `material.interactionConfig.${field}`,
      value,
      'expected a boolean',
    );
  }
  target[field] = value;
}

function copyPreset(source: UnknownRecord, target: UnknownRecord): void {
  if (!hasOwn(source, 'preset')) return;
  const value = source.preset;
  if (value === undefined) {
    target.preset = undefined;
    return;
  }
  if (
    typeof value !== 'string'
    || !INTERACTION_PRESETS.includes(value as InteractionPreset)
  ) {
    invalidInteraction(
      'material.interactionConfig.preset',
      value,
      'expected a supported interaction preset',
    );
  }
  target.preset = value;
}

function copyString(
  source: UnknownRecord,
  target: UnknownRecord,
  field: string,
  preserveUndefined = false,
): void {
  if (!hasOwn(source, field)) return;
  const value = source[field];
  if (value === undefined) {
    if (preserveUndefined) target[field] = undefined;
    return;
  }
  if (typeof value !== 'string') {
    invalidInteraction(
      `material.interactionConfig.${field}`,
      value,
      'expected a string',
    );
  }
  target[field] = value;
}

function copySpring(
  source: UnknownRecord,
  target: UnknownRecord,
  field: 'hoverSpring' | 'activeSpring' | 'releaseSpring',
): void {
  if (!hasOwn(source, field) || source[field] === undefined) return;
  const spring = requirePlainRecord(
    source[field],
    `material.interactionConfig.${field}`,
  );
  for (const springField of Reflect.ownKeys(spring)) {
    if (
      typeof springField !== 'string'
      || !SPRING_FIELDS.includes(springField as keyof SpringConfig)
    ) {
      invalidInteraction(
        `material.interactionConfig.${field}`,
        springField,
        'contains an unknown spring field',
      );
    }
  }
  for (const springField of SPRING_FIELDS) {
    if (!hasOwn(spring, springField) || spring[springField] === undefined) {
      invalidInteraction(
        `material.interactionConfig.${field}.${springField}`,
        spring[springField],
        'expected a complete spring configuration',
      );
    }
  }
  target[field] = {
    stiffness: validateFiniteNumber(
      spring.stiffness,
      `material.interactionConfig.${field}.stiffness`,
      { minimum: 0 },
    ),
    damping: validateFiniteNumber(
      spring.damping,
      `material.interactionConfig.${field}.damping`,
      { minimum: 0 },
    ),
    mass: validateFiniteNumber(
      spring.mass,
      `material.interactionConfig.${field}.mass`,
      { minimum: 0, exclusiveMinimum: true },
    ),
  } satisfies SpringConfig;
}

/** Validate and deeply snapshot one partial interaction override. */
export function snapshotMaterialInteractionConfig(
  value: unknown,
): PartialInteractionConfig {
  const source = requirePlainRecord(value, 'material.interactionConfig');
  assertKnownFields(source);
  const target: UnknownRecord = {};

  copyPreset(source, target);
  copyNumber(source, target, 'baseScale', { minimum: 0, exclusiveMinimum: true });
  copyNumber(source, target, 'hoverScale', { minimum: 0, exclusiveMinimum: true });
  copyNumber(source, target, 'activeScale', { minimum: 0, exclusiveMinimum: true });
  copyNumber(source, target, 'maxScale', { minimum: 0.5 });
  copyBoolean(source, target, 'enableHoverFollow');
  copyNumber(source, target, 'hoverFollowFactor');
  copyNumber(source, target, 'hoverFollowMaxDistance', { minimum: 0 });
  copyNumber(source, target, 'translateFactor');
  copyNumber(source, target, 'maxTranslate', { minimum: 0 });
  copyNumber(source, target, 'maxTranslateY', { minimum: 0 }, true);
  copyNumber(source, target, 'stretchFactor', { minimum: 0 });
  copyNumber(source, target, 'stretchLimit', { minimum: 0 });
  copyBoolean(source, target, 'preserveArea');
  copyBoolean(source, target, 'velocityStretch', true);
  copyNumber(source, target, 'velocityStretchFactor', { minimum: 0 }, true);
  copyBoolean(source, target, 'ignorePointerPosition', true);
  copyBoolean(source, target, 'enableOriginShift');
  copyNumber(source, target, 'originShiftSensitivity', { minimum: 0, maximum: 1 });
  copyBoolean(source, target, 'enableIdleReturn');
  copyNumber(source, target, 'idleReturnDelay', { minimum: 0 });
  copyBoolean(source, target, 'idleReturnPartial');
  copyNumber(source, target, 'idleReturnRatio', { minimum: 0, maximum: 1 }, true);
  copyBoolean(source, target, 'keepScaleOnIdleReturn', true);
  copyBoolean(source, target, 'useAbsoluteValues', true);
  copySpring(source, target, 'hoverSpring');
  copySpring(source, target, 'activeSpring');
  copySpring(source, target, 'releaseSpring');
  copyBoolean(source, target, 'showHighlight');
  copyNumber(source, target, 'highlightSize', { minimum: 0 });
  copyNumber(source, target, 'highlightOpacity', { minimum: 0, maximum: 1 });
  copyNumber(source, target, 'highlightHDRFactor', { minimum: 0 });
  copyNumber(source, target, 'highlightFollowSpeed', { minimum: 0, maximum: 1 });
  copyNumber(source, target, 'activeOpacity', { minimum: 0, maximum: 1 }, true);
  copyBoolean(source, target, 'enableOpacityTransition', true);
  copyString(source, target, 'activeBackgroundColor', true);
  copyBoolean(source, target, 'enableBackgroundTransition', true);
  copyNumber(source, target, 'restThreshold', { minimum: 0, exclusiveMinimum: true });
  copyNumber(source, target, 'velocityThreshold', {
    minimum: 0,
    exclusiveMinimum: true,
  });

  return target as PartialInteractionConfig;
}

/** Return a detached clone of a validated partial interaction override. */
export function cloneMaterialInteractionConfig(
  config: PartialInteractionConfig,
): PartialInteractionConfig {
  return snapshotMaterialInteractionConfig(config);
}

/** Compare canonical partial interaction overrides, including owned undefined fields. */
export function materialInteractionConfigsEqual(
  left: PartialInteractionConfig | undefined,
  right: PartialInteractionConfig | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  const leftRecord = left as UnknownRecord;
  const rightRecord = right as UnknownRecord;
  for (const field of INTERACTION_FIELDS) {
    const leftOwns = hasOwn(leftRecord, field);
    const rightOwns = hasOwn(rightRecord, field);
    if (leftOwns !== rightOwns) return false;
    if (!leftOwns) continue;
    const leftValue = leftRecord[field];
    const rightValue = rightRecord[field];
    if (
      field === 'hoverSpring'
      || field === 'activeSpring'
      || field === 'releaseSpring'
    ) {
      const leftSpring = leftValue as SpringConfig;
      const rightSpring = rightValue as SpringConfig;
      if (
        leftSpring.stiffness !== rightSpring.stiffness
        || leftSpring.damping !== rightSpring.damping
        || leftSpring.mass !== rightSpring.mass
      ) {
        return false;
      }
    } else if (leftValue !== rightValue) {
      return false;
    }
  }
  return true;
}
