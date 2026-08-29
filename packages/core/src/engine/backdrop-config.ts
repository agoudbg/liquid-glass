import type {
  BackdropSourceChanges,
  BackdropSourceConfig,
  CanvasBackdropSourceConfig,
  DomBackdropSourceConfig,
  ViewportCaptureConfig,
} from '../types/context';
import {
  CANVAS_BACKDROP_OPTION_FIELDS,
  DOM_BACKDROP_OPTION_FIELDS,
  snapshotCanvasBackdropSourceChanges,
  snapshotCanvasBackdropSourceConfig,
  snapshotDomBackdropSourceChanges,
  snapshotDomBackdropSourceConfig,
} from './backdrop-config-snapshot';

type UnknownRecord = Record<string, unknown>;

export {
  readBackdropSourceKind,
  snapshotCanvasBackdropSourceConfig,
  snapshotDomBackdropSourceConfig,
} from './backdrop-config-snapshot';

/** A validated backdrop update ready for an atomic observer rebind. */
export interface PreparedBackdropSourceUpdate<Config extends BackdropSourceConfig> {
  /** Detached canonical configuration that becomes the new internal state. */
  readonly next: Config;
}

function hasOwn(record: UnknownRecord, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function applyChanges(
  current: BackdropSourceConfig,
  changes: UnknownRecord,
  fields: readonly string[],
): UnknownRecord {
  const candidate = { ...current } as UnknownRecord;
  for (const field of fields) {
    if (!hasOwn(changes, field)) continue;
    const value = changes[field];
    if (value === undefined) {
      delete candidate[field];
    } else {
      candidate[field] = value;
    }
  }
  return candidate;
}

function viewportCaptureValuesEqual(left: unknown, right: unknown): boolean {
  if (typeof left !== 'object' || left === null) return left === right;
  if (typeof right !== 'object' || right === null) return false;
  const leftViewport = left as ViewportCaptureConfig;
  const rightViewport = right as ViewportCaptureConfig;
  return leftViewport.bufferX === rightViewport.bufferX
    && leftViewport.bufferY === rightViewport.bufferY
    && leftViewport.enabled === rightViewport.enabled;
}

function configsEqual(
  left: BackdropSourceConfig,
  right: BackdropSourceConfig,
  fields: readonly string[],
): boolean {
  const leftRecord = left as unknown as UnknownRecord;
  const rightRecord = right as unknown as UnknownRecord;
  for (const field of fields) {
    const leftOwns = hasOwn(leftRecord, field);
    const rightOwns = hasOwn(rightRecord, field);
    if (leftOwns !== rightOwns) return false;
    if (!leftOwns) continue;
    const equal = field === 'viewportCapture'
      ? viewportCaptureValuesEqual(leftRecord[field], rightRecord[field])
      : leftRecord[field] === rightRecord[field];
    if (!equal) return false;
  }
  return true;
}

/** Validate a DOM source update and return null for a semantic no-op. */
export function prepareDomBackdropSourceUpdate(
  current: DomBackdropSourceConfig,
  changes: BackdropSourceChanges<DomBackdropSourceConfig>,
): PreparedBackdropSourceUpdate<DomBackdropSourceConfig> | null {
  const detachedChanges = snapshotDomBackdropSourceChanges(changes);
  const next = snapshotDomBackdropSourceConfig(
    applyChanges(
      current,
      detachedChanges,
      DOM_BACKDROP_OPTION_FIELDS,
    ) as unknown as DomBackdropSourceConfig,
  );
  return configsEqual(current, next, DOM_BACKDROP_OPTION_FIELDS) ? null : { next };
}

/** Validate a canvas source update and return null for a semantic no-op. */
export function prepareCanvasBackdropSourceUpdate(
  current: CanvasBackdropSourceConfig,
  changes: BackdropSourceChanges<CanvasBackdropSourceConfig>,
): PreparedBackdropSourceUpdate<CanvasBackdropSourceConfig> | null {
  const detachedChanges = snapshotCanvasBackdropSourceChanges(changes);
  const next = snapshotCanvasBackdropSourceConfig(
    applyChanges(
      current,
      detachedChanges,
      CANVAS_BACKDROP_OPTION_FIELDS,
    ) as unknown as CanvasBackdropSourceConfig,
  );
  return configsEqual(current, next, CANVAS_BACKDROP_OPTION_FIELDS) ? null : { next };
}
