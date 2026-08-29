import { GlassError } from '../errors/GlassError';
import type {
  BackdropSourceChanges,
  BackdropSourceConfig,
  CanvasBackdropSourceConfig,
  DomBackdropSourceConfig,
  ViewportCaptureConfig,
} from '../types/context';
import { validateFiniteNumber } from '../utils/validation';

type UnknownRecord = Record<string, unknown>;

const BASE_FIELDS = [
  'backgroundColor',
  'scale',
  'watchNodeChanges',
  'watchPositionChanges',
  'watchResize',
  'zIndex',
] as const;

/** Mutable fields accepted by a DOM backdrop registration. */
export const DOM_BACKDROP_OPTION_FIELDS = [
  ...BASE_FIELDS,
  'captureLibrary',
  'viewportCapture',
] as const;

/** Mutable fields accepted by a canvas backdrop registration. */
export const CANVAS_BACKDROP_OPTION_FIELDS = [
  ...BASE_FIELDS,
  'boundsElement',
  'draw',
  'mirrorToElement',
] as const;

const DOM_FIELDS = new Set(['kind', 'element', ...DOM_BACKDROP_OPTION_FIELDS]);
const CANVAS_FIELDS = new Set(['kind', 'element', ...CANVAS_BACKDROP_OPTION_FIELDS]);
const DOM_CHANGE_FIELDS = new Set<string>(DOM_BACKDROP_OPTION_FIELDS);
const CANVAS_CHANGE_FIELDS = new Set<string>(CANVAS_BACKDROP_OPTION_FIELDS);
const VIEWPORT_CAPTURE_FIELDS = new Set(['bufferX', 'bufferY', 'enabled']);

function invalidBackdrop(field: string, value: unknown, reason: string): never {
  throw new GlassError(
    'INVALID_CONFIG',
    `Invalid backdrop source configuration for "${field}": ${reason}.`,
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
    return invalidBackdrop(field, value, 'expected an object');
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
      invalidBackdrop(field, key, 'contains an unknown field');
    }
  }
}

function requireLayoutElement(value: unknown, field: string): HTMLElement {
  const candidate = requireRecord(value, field);
  if (typeof candidate.getBoundingClientRect !== 'function') {
    return invalidBackdrop(field, value, 'expected an element with getBoundingClientRect()');
  }
  return value as HTMLElement;
}

function requireDomElement(value: unknown): HTMLElement {
  const element = requireLayoutElement(value, 'backdrop.element');
  const candidate = element as unknown as UnknownRecord;
  if (typeof candidate.querySelectorAll !== 'function') {
    return invalidBackdrop(
      'backdrop.element',
      value,
      'expected an HTML element with querySelectorAll()',
    );
  }
  return element;
}

function requireCanvasElement(value: unknown): HTMLCanvasElement {
  const element = requireLayoutElement(value, 'backdrop.element');
  if (typeof (element as unknown as UnknownRecord).getContext !== 'function') {
    return invalidBackdrop(
      'backdrop.element',
      value,
      'expected a canvas element with getContext()',
    );
  }
  return element as HTMLCanvasElement;
}

function copyString(
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
  if (typeof value !== 'string') {
    invalidBackdrop(`backdrop.${field}`, value, 'expected a string');
  }
  target[field] = value;
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
    invalidBackdrop(`backdrop.${field}`, value, 'expected a boolean');
  }
  target[field] = value;
}

function copyNumber(
  source: UnknownRecord,
  target: UnknownRecord,
  field: string,
  retainUndefined: boolean,
  options: { minimum?: number; exclusiveMinimum?: boolean } = {},
): void {
  if (!hasOwn(source, field)) return;
  const value = source[field];
  if (value === undefined) {
    if (retainUndefined) target[field] = undefined;
    return;
  }
  target[field] = validateFiniteNumber(value, `backdrop.${field}`, options);
}

function snapshotViewportCapture(value: unknown): boolean | ViewportCaptureConfig {
  if (typeof value === 'boolean') return value;
  const source = requireRecord(value, 'backdrop.viewportCapture');
  assertKnownFields(source, VIEWPORT_CAPTURE_FIELDS, 'backdrop.viewportCapture');
  const target: UnknownRecord = {};
  copyNumber(source, target, 'bufferX', false, { minimum: 0 });
  copyNumber(source, target, 'bufferY', false, { minimum: 0 });
  copyBoolean(source, target, 'enabled', false);
  return target as unknown as ViewportCaptureConfig;
}

function copyViewportCapture(
  source: UnknownRecord,
  target: UnknownRecord,
  retainUndefined: boolean,
): void {
  if (!hasOwn(source, 'viewportCapture')) return;
  const value = source.viewportCapture;
  if (value === undefined) {
    if (retainUndefined) target.viewportCapture = undefined;
    return;
  }
  target.viewportCapture = snapshotViewportCapture(value);
}

function copyBaseOptions(
  source: UnknownRecord,
  target: UnknownRecord,
  retainUndefined: boolean,
): void {
  copyString(source, target, 'backgroundColor', retainUndefined);
  copyNumber(source, target, 'scale', retainUndefined, {
    exclusiveMinimum: true,
    minimum: 0,
  });
  copyBoolean(source, target, 'watchNodeChanges', retainUndefined);
  copyBoolean(source, target, 'watchPositionChanges', retainUndefined);
  copyBoolean(source, target, 'watchResize', retainUndefined);
  copyNumber(source, target, 'zIndex', retainUndefined);
}

function copyCaptureLibrary(
  source: UnknownRecord,
  target: UnknownRecord,
  retainUndefined: boolean,
): void {
  if (!hasOwn(source, 'captureLibrary')) return;
  const value = source.captureLibrary;
  if (value === undefined) {
    if (retainUndefined) target.captureLibrary = undefined;
    return;
  }
  if (value !== 'html-to-image' && value !== 'html2canvas') {
    invalidBackdrop(
      'backdrop.captureLibrary',
      value,
      'expected a supported capture library',
    );
  }
  target.captureLibrary = value;
}

function copyLayoutElement(
  source: UnknownRecord,
  target: UnknownRecord,
  retainUndefined: boolean,
): void {
  if (!hasOwn(source, 'boundsElement')) return;
  const value = source.boundsElement;
  if (value === undefined) {
    if (retainUndefined) target.boundsElement = undefined;
    return;
  }
  target.boundsElement = requireLayoutElement(value, 'backdrop.boundsElement');
}

function copyDraw(
  source: UnknownRecord,
  target: UnknownRecord,
  retainUndefined: boolean,
): void {
  if (!hasOwn(source, 'draw')) return;
  const value = source.draw;
  if (value === undefined) {
    if (retainUndefined) target.draw = undefined;
    return;
  }
  if (typeof value !== 'function') {
    invalidBackdrop('backdrop.draw', value, 'expected a drawing callback');
  }
  target.draw = value;
}

function snapshotDomOptions(
  source: UnknownRecord,
  retainUndefined: boolean,
): UnknownRecord {
  const target: UnknownRecord = {};
  copyBaseOptions(source, target, retainUndefined);
  copyCaptureLibrary(source, target, retainUndefined);
  copyViewportCapture(source, target, retainUndefined);
  return target;
}

function snapshotCanvasOptions(
  source: UnknownRecord,
  retainUndefined: boolean,
): UnknownRecord {
  const target: UnknownRecord = {};
  copyBaseOptions(source, target, retainUndefined);
  copyLayoutElement(source, target, retainUndefined);
  copyDraw(source, target, retainUndefined);
  copyBoolean(source, target, 'mirrorToElement', retainUndefined);
  return target;
}

/** Read and validate the discriminator before dispatching to a source owner. */
export function readBackdropSourceKind(value: unknown): BackdropSourceConfig['kind'] {
  const source = requireRecord(value, 'backdrop');
  if (source.kind !== 'dom' && source.kind !== 'canvas') {
    return invalidBackdrop(
      'backdrop.kind',
      source.kind,
      'expected "dom" or "canvas"',
    );
  }
  return source.kind;
}

/** Validate and detach a complete DOM backdrop source configuration. */
export function snapshotDomBackdropSourceConfig(
  config: DomBackdropSourceConfig,
): DomBackdropSourceConfig {
  const source = requireRecord(config, 'backdrop');
  assertKnownFields(source, DOM_FIELDS, 'backdrop');
  if (readBackdropSourceKind(source) !== 'dom') {
    return invalidBackdrop('backdrop.kind', source.kind, 'expected "dom"');
  }
  return {
    kind: 'dom',
    element: requireDomElement(source.element),
    ...snapshotDomOptions(source, false),
  } as DomBackdropSourceConfig;
}

/** Validate and detach a complete custom-canvas backdrop configuration. */
export function snapshotCanvasBackdropSourceConfig(
  config: CanvasBackdropSourceConfig,
): CanvasBackdropSourceConfig {
  const source = requireRecord(config, 'backdrop');
  assertKnownFields(source, CANVAS_FIELDS, 'backdrop');
  if (readBackdropSourceKind(source) !== 'canvas') {
    return invalidBackdrop('backdrop.kind', source.kind, 'expected "canvas"');
  }
  const options = snapshotCanvasOptions(source, false);
  if (typeof options.draw !== 'function') {
    return invalidBackdrop('backdrop.draw', source.draw, 'expected a drawing callback');
  }
  return {
    kind: 'canvas',
    element: requireCanvasElement(source.element),
    ...options,
  } as CanvasBackdropSourceConfig;
}

/** Validate and detach mutable DOM backdrop source fields. */
export function snapshotDomBackdropSourceChanges(
  changes: BackdropSourceChanges<DomBackdropSourceConfig>,
): UnknownRecord {
  const source = requireRecord(changes, 'backdrop changes');
  assertKnownFields(source, DOM_CHANGE_FIELDS, 'backdrop changes');
  return snapshotDomOptions(source, true);
}

/** Validate and detach mutable canvas backdrop source fields. */
export function snapshotCanvasBackdropSourceChanges(
  changes: BackdropSourceChanges<CanvasBackdropSourceConfig>,
): UnknownRecord {
  const source = requireRecord(changes, 'backdrop changes');
  assertKnownFields(source, CANVAS_CHANGE_FIELDS, 'backdrop changes');
  return snapshotCanvasOptions(source, true);
}
