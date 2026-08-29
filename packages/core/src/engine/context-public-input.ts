import { GlassError } from '../errors/GlassError';
import type { TextureDirtyReason } from '../types/context';

const CONTEXT_CONTAINER_METHODS = [
  'appendChild',
  'getAttribute',
  'removeAttribute',
  'removeChild',
  'setAttribute',
] as const;

const TEXTURE_DIRTY_REASONS: ReadonlySet<unknown> = new Set<TextureDirtyReason>([
  'layout',
  'scroll',
  'visibility',
  'material_interaction',
  'structural',
  'external',
  'viewport',
  'fallback',
  'unknown',
]);

function invalidContextInput(field: string, value: unknown, reason: string): never {
  throw new GlassError(
    'INVALID_CONFIG',
    `Invalid liquid-glass context input for "${field}": ${reason}.`,
    {
      phase: 'configuration',
      details: { field, value, reason },
    },
  );
}

/** Validate a cross-realm DOM container before any context resources are allocated. */
export function assertContextContainer(
  container: unknown,
): asserts container is HTMLElement {
  if (typeof container !== 'object' || container === null) {
    invalidContextInput('container', container, 'expected an HTMLElement-like object');
  }
  const candidate = container as Record<PropertyKey, unknown>;
  const missingMethods = CONTEXT_CONTAINER_METHODS.filter(
    (method) => typeof candidate[method] !== 'function',
  );
  if (missingMethods.length > 0) {
    invalidContextInput(
      'container',
      container,
      `missing required DOM methods: ${missingMethods.join(', ')}`,
    );
  }
}

/** Validate a public imperative boolean without applying JavaScript coercion. */
export function validateContextBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    invalidContextInput(field, value, 'expected a boolean');
  }
  return value;
}

/** Validate the finite dirty-reason vocabulary accepted by context refresh. */
export function validateTextureDirtyReason(reason: unknown): TextureDirtyReason {
  if (!TEXTURE_DIRTY_REASONS.has(reason)) {
    invalidContextInput(
      'context.refresh.reason',
      reason,
      'expected a supported texture dirty reason',
    );
  }
  return reason as TextureDirtyReason;
}
