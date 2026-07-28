import {
  GlassError,
  type GlassErrorContext,
} from '../errors/GlassError';

/** Wrap a diagnostics subscriber failure without re-entering diagnostics. */
export function createDiagnosticsListenerError(
  error: unknown,
): GlassErrorContext {
  return GlassError.fromUnknown(
    error,
    'EVENT_LISTENER_FAILED',
    'A liquid-glass diagnostics listener failed.',
    {
      phase: 'event',
      details: { event: 'diagnosticsUpdated' },
    },
  ).toContext();
}
