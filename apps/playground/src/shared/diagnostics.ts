import type { GlassContext, GlassErrorContext } from '@agou/liquid-glass-core';

import type { HostRuntimeReport } from './types';

/** Observe renderer frames and request one deterministic post-mount composite. */
export function observeGlassContext(
  context: GlassContext,
  onReport: (report: HostRuntimeReport) => void,
): () => void {
  const gl = context.canvas.getContext('webgl2');
  let frameCount = 0;
  let firstFrameRequest = 0;

  if (!gl) {
    onReport({
      status: 'error',
      frameCount,
      canvasWidth: context.canvas.width,
      canvasHeight: context.canvas.height,
      glError: 'WEBGL2_UNAVAILABLE',
      error: 'The mounted presentation canvas has no WebGL2 context.',
    });
    return () => undefined;
  }

  const publishFrame = (): void => {
    frameCount += 1;
    const errorCode = gl.getError();
    onReport({
      status: errorCode === gl.NO_ERROR ? 'ready' : 'error',
      frameCount,
      canvasWidth: context.canvas.width,
      canvasHeight: context.canvas.height,
      glError: formatGlError(gl, errorCode),
      error: errorCode === gl.NO_ERROR
        ? null
        : `WebGL reported ${formatGlError(gl, errorCode)}.`,
    });
  };

  const publishError = (error: GlassErrorContext): void => {
    onReport({
      status: 'error',
      frameCount,
      canvasWidth: context.canvas.width,
      canvasHeight: context.canvas.height,
      glError: null,
      error: `${error.code}: ${error.message}`,
    });
  };

  const stopFrameEvents = context.on('materialsRendered', publishFrame);
  const stopErrorEvents = context.on('error', publishError);
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
    stopErrorEvents();
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
