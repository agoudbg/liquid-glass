/** Assert that an unknown schema value is a non-array object. */
export function expectRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

/** Read an unknown schema value as an array. */
export function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

/** Read an unknown schema value as a non-empty string. */
export function readString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

/** Read an unknown schema value as a finite number. */
export function readNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

/** Read an unknown schema value as a positive integer. */
export function readPositiveInteger(value: unknown, label: string): number {
  const number = readNumber(value, label);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return number;
}

/** Read an unknown schema value as a non-negative integer. */
export function readNonNegativeInteger(value: unknown, label: string): number {
  const number = readNumber(value, label);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return number;
}

/** Read an unknown schema value as a ratio in the inclusive zero-to-one range. */
export function readRatio(value: unknown, label: string): number {
  const ratio = readNumber(value, label);
  if (ratio < 0 || ratio > 1) {
    throw new Error(`${label} must be between zero and one.`);
  }
  return ratio;
}

/** Assert that a list contains no duplicate scalar values. */
export function assertUnique(
  values: readonly (number | string)[],
  label: string,
): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates.`);
  }
}

/** Read an unknown schema value as a unique list of non-empty strings. */
export function readStringArray(value: unknown, label: string): string[] {
  const entries = readArray(value, label).map((entry, index) => (
    readString(entry, `${label}[${index}]`)
  ));
  assertUnique(entries, label);
  return entries;
}

/** Compare two unique scalar lists without making their order significant. */
export function haveSameValues(
  first: readonly (number | string)[],
  second: readonly (number | string)[],
): boolean {
  return first.length === second.length
    && first.every((entry) => second.includes(entry));
}
