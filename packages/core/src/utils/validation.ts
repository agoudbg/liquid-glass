import { GlassError } from '../errors/GlassError';

/**
 * Constraints accepted by finite-number validation.
 */
export interface NumberValidationOptions {
  /** Inclusive minimum unless `exclusiveMinimum` is true. */
  minimum?: number;
  /** Inclusive maximum unless `exclusiveMaximum` is true. */
  maximum?: number;
  /** Require the value to be strictly greater than `minimum`. */
  exclusiveMinimum?: boolean;
  /** Require the value to be strictly less than `maximum`. */
  exclusiveMaximum?: boolean;
  /** Require an integer. */
  integer?: boolean;
}

function invalidNumber(
  field: string,
  value: unknown,
  options: NumberValidationOptions,
  reason: string,
): GlassError {
  return new GlassError(
    'INVALID_CONFIG',
    `Invalid numeric configuration for "${field}": ${reason}.`,
    {
      phase: 'configuration',
      details: {
        field,
        value,
        minimum: options.minimum,
        maximum: options.maximum,
        exclusiveMinimum: options.exclusiveMinimum,
        exclusiveMaximum: options.exclusiveMaximum,
        integer: options.integer,
      },
    },
  );
}

/**
 * Validate an unknown input as a finite number within explicit constraints.
 *
 * @param value - Untrusted input value.
 * @param field - Configuration field name used in diagnostics.
 * @param options - Optional range and integer constraints.
 * @returns The validated number without coercion.
 * @throws GlassError when the value or constraints are invalid.
 */
export function validateFiniteNumber(
  value: unknown,
  field: string,
  options: NumberValidationOptions = {},
): number {
  if (options.minimum !== undefined && !Number.isFinite(options.minimum)) {
    throw invalidNumber(field, value, options, 'minimum constraint must be finite');
  }

  if (options.maximum !== undefined && !Number.isFinite(options.maximum)) {
    throw invalidNumber(field, value, options, 'maximum constraint must be finite');
  }

  if (
    options.minimum !== undefined
    && options.maximum !== undefined
    && options.minimum > options.maximum
  ) {
    throw invalidNumber(field, value, options, 'minimum exceeds maximum');
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidNumber(field, value, options, 'expected a finite number');
  }

  if (options.integer && !Number.isInteger(value)) {
    throw invalidNumber(field, value, options, 'expected an integer');
  }

  if (options.minimum !== undefined) {
    const belowMinimum = options.exclusiveMinimum
      ? value <= options.minimum
      : value < options.minimum;
    if (belowMinimum) {
      const qualifier = options.exclusiveMinimum ? 'greater than' : 'at least';
      throw invalidNumber(field, value, options, `expected ${qualifier} ${options.minimum}`);
    }
  }

  if (options.maximum !== undefined) {
    const aboveMaximum = options.exclusiveMaximum
      ? value >= options.maximum
      : value > options.maximum;
    if (aboveMaximum) {
      const qualifier = options.exclusiveMaximum ? 'less than' : 'at most';
      throw invalidNumber(field, value, options, `expected ${qualifier} ${options.maximum}`);
    }
  }

  return value;
}

/**
 * Validate an optional numeric input without interpreting `null` as absence.
 *
 * @param value - Optional untrusted input value.
 * @param field - Configuration field name used in diagnostics.
 * @param options - Optional range and integer constraints.
 * @returns `undefined` or a validated finite number.
 * @throws GlassError when a present value is invalid.
 */
export function validateOptionalFiniteNumber(
  value: unknown,
  field: string,
  options: NumberValidationOptions = {},
): number | undefined {
  return value === undefined
    ? undefined
    : validateFiniteNumber(value, field, options);
}

/**
 * Validate a non-negative finite number.
 *
 * @param value - Untrusted input value.
 * @param field - Configuration field name used in diagnostics.
 * @returns The validated number.
 * @throws GlassError when the value is negative or non-finite.
 */
export function validateNonNegativeNumber(value: unknown, field: string): number {
  return validateFiniteNumber(value, field, { minimum: 0 });
}

/**
 * Clamp an already validated number to an inclusive interval.
 *
 * @param value - Finite number to clamp.
 * @param minimum - Inclusive lower bound.
 * @param maximum - Inclusive upper bound.
 * @returns Clamped value.
 * @throws GlassError when any argument is invalid or bounds are reversed.
 */
export function clampFiniteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  const validMinimum = validateFiniteNumber(minimum, 'minimum');
  const validMaximum = validateFiniteNumber(maximum, 'maximum', { minimum: validMinimum });
  const validValue = validateFiniteNumber(value, 'value');
  return Math.min(validMaximum, Math.max(validMinimum, validValue));
}
