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
  const gl = context.canvas.getContext('webgl2');
  let frameCount = 0;
  let captureCount = 0;
  let lastCapture: BackdropCaptureReport | null = null;
  let firstFrameRequest = 0;

  if (!gl) {
    onReport({
      status: context.fallbackMode ? 'ready' : 'error',
      fallbackMode: context.fallbackMode,
      frameCount,
      captureCount,
      lastCapture,
      canvasWidth: context.canvas.width,
      canvasHeight: context.canvas.height,
      glError: 'WEBGL2_UNAVAILABLE',
      error: context.fallbackMode
        ? null
        : 'The mounted presentation canvas has no WebGL2 context.',
    });
    return () => undefined;
  }

  const publishReport = (incrementFrame: boolean): void => {
    if (incrementFrame) frameCount += 1;
    const errorCode = gl.getError();
    onReport({
      status: errorCode === gl.NO_ERROR ? 'ready' : 'error',
      fallbackMode: context.fallbackMode,
      frameCount,
      captureCount,
      lastCapture,
      canvasWidth: context.canvas.width,
      canvasHeight: context.canvas.height,
      glError: formatGlError(gl, errorCode),
      error: errorCode === gl.NO_ERROR
        ? null
        : `WebGL reported ${formatGlError(gl, errorCode)}.`,
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
        context.refresh('external');
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

function formatGlError(gl: WebGL2RenderingContext, errorCode: number): string {
  if (errorCode === gl.NO_ERROR) return 'NO_ERROR';
  if (errorCode === gl.INVALID_ENUM) return 'INVALID_ENUM';
  if (errorCode === gl.INVALID_VALUE) return 'INVALID_VALUE';
  if (errorCode === gl.INVALID_OPERATION) return 'INVALID_OPERATION';
  if (errorCode === gl.INVALID_FRAMEBUFFER_OPERATION) {
    return 'INVALID_FRAMEBUFFER_OPERATION';
  }
  if (errorCode === gl.OUT_OF_MEMORY) return 'OUT_OF_MEMORY';
  if (errorCode === gl.CONTEXT_LOST_WEBGL) return 'CONTEXT_LOST_WEBGL';
  return `0x${errorCode.toString(16).toUpperCase()}`;
}
