import type { DirtyFrameSchedulerRuntime } from '../backdrop/DirtyFrameScheduler';
import { GlassError } from '../errors/GlassError';
import type { GlassEngineRuntime } from './runtime';

type FrameRuntimeSource = Pick<
  GlassEngineRuntime,
  'cancelAnimationFrame' | 'requestAnimationFrame'
>;

/** Resolve the complete animation-frame capability required by DOM capture. */
export function requireDomCaptureFrameRuntime(
  runtime: FrameRuntimeSource,
): DirtyFrameSchedulerRuntime {
  const requestFrame = runtime.requestAnimationFrame
    ?? (
      typeof globalThis.requestAnimationFrame === 'function'
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : null
    );
  const cancelFrame = runtime.cancelAnimationFrame
    ?? (
      typeof globalThis.cancelAnimationFrame === 'function'
        ? globalThis.cancelAnimationFrame.bind(globalThis)
        : null
    );
  if (!requestFrame || !cancelFrame) {
    throw new GlassError(
      'LIFECYCLE_FAILED',
      'Animation frame APIs are required for DOM backdrop capture.',
      { phase: 'lifecycle' },
    );
  }
  return {
    cancelAnimationFrame: (handle) => cancelFrame(handle),
    requestAnimationFrame: (callback) => requestFrame(callback),
  };
}
