import type {
  BackdropCapturedPayload,
  GlassContext,
  GlassErrorContext,
} from '@agou/liquid-glass-core';

import type {
  BackdropCaptureReport,
  HostRuntimeReport,
} from './types';

/** Observe renderer frames and request one deterministic post-mount composite. */
export function observeGlassContext(
  context: GlassContext,
  onReport: (report: HostRuntimeReport) => void,
): () => void {
  let frameCount = 0;
  let captureCount = 0;
  let lastCapture: BackdropCaptureReport | null = null;
  let firstFrameRequest = 0;

  const publishReport = (incrementFrame: boolean): void => {
    if (incrementFrame) frameCount += 1;
    onReport({
      status: 'ready',
      fallbackMode: context.fallbackMode,
      frameCount,
      captureCount,
      lastCapture,
      canvasWidth: context.canvas.width,
      canvasHeight: context.canvas.height,
      // Core checks the internal WebGL context before publishing a frame.
      glError: 'NO_ERROR',
      error: null,
    });
  };
  const publishFrame = (): void => publishReport(true);

  const publishError = (error: GlassErrorContext): void => {
    onReport({
      status: 'error',
      fallbackMode: context.fallbackMode,
      frameCount,
      captureCount,
      lastCapture,
      canvasWidth: context.canvas.width,
      canvasHeight: context.canvas.height,
      glError: null,
      error: `${error.code}: ${error.message}`,
    });
  };

  const stopFrameEvents = context.on('materialsRendered', publishFrame);
  const stopCaptureEvents = context.on(
    'backdropCaptured',
    (capture: BackdropCapturedPayload) => {
      captureCount += 1;
      lastCapture = {
        id: capture.id,
        width: capture.width,
        height: capture.height,
        viewportRect: capture.viewportRect
          ? { ...capture.viewportRect }
          : undefined,
      };
      publishReport(false);
    },
  );
  const stopErrorEvents = context.on('error', publishError);
  const stopFallbackEvents = context.on(
    'fallbackModeChanged',
    () => publishReport(false),
  );
  firstFrameRequest = window.requestAnimationFrame(() => {
    firstFrameRequest = window.requestAnimationFrame(() => {
      try {
        context.refresh('structural');
      } catch {
        // The context event carries the structured failure to the shell.
      }
    });
  });

  return () => {
    window.cancelAnimationFrame(firstFrameRequest);
    stopFrameEvents();
    stopCaptureEvents();
    stopErrorEvents();
    stopFallbackEvents();
  };
}
