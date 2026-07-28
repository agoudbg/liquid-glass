import {
  GlassError,
  type GlassErrorContext,
} from '../errors/GlassError';

/** Create the event payload for one isolated backdrop-source capture failure. */
export function createBackdropSourceCaptureError(
  error: unknown,
  backdropId: string,
): GlassErrorContext {
  return GlassError.fromUnknown(
    error,
    'CAPTURE_FAILED',
    'Failed to capture a DOM backdrop source.',
    { phase: 'capture', backdropId },
  ).toContext();
}

/** Create the event payload for a capture scheduler or composite failure. */
export function createScheduledCaptureError(
  error: unknown,
): GlassErrorContext {
  return GlassError.fromUnknown(
    error,
    'CAPTURE_FAILED',
    'Failed to capture and composite the DOM backdrop.',
    { phase: 'capture' },
  ).toContext();
}
