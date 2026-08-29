import { GlassError } from '../errors/GlassError';
import { WebGLRenderer } from '../renderer';
import type { GlassContextOptions } from '../types/context';
import type { GlassEngineRuntime } from './runtime';

/** Lifecycle callbacks forwarded from the renderer into its owning context. */
export interface ContextRendererCallbacks {
  /** Notify the context immediately after WebGL is lost. */
  onContextLost(): void;
  /** Commit context presentation while renderer resources can still roll back. */
  onContextResourcesRestored(): void;
  /** Notify the context after renderer resources and presentation are committed. */
  onContextRestored(): void;
  /** Surface a typed failure when WebGL resources cannot be recreated. */
  onContextRestoreError(error: GlassError): void;
}

/** Reject an option update that would expose a context without a renderer. */
export function assertContextRendererOptions(
  renderer: WebGLRenderer | null,
  options: Pick<GlassContextOptions, 'enableFallback'>,
): void {
  if (!renderer && options.enableFallback === false) {
    throw new GlassError(
      'INVALID_CONFIG',
      'Automatic fallback cannot be disabled without an available WebGL2 renderer.',
      { phase: 'configuration' },
    );
  }
}

/**
 * Create the WebGL renderer or select the supported automatic fallback path.
 *
 * Shader, program, and resource failures remain fatal. Only the stable
 * `WEBGL2_UNSUPPORTED` capability error may degrade to CSS presentation.
 */
export function createContextRenderer(
  canvas: HTMLCanvasElement,
  renderScale: number,
  runtime: GlassEngineRuntime,
  options: Pick<GlassContextOptions, 'enableFallback'>,
  callbacks: ContextRendererCallbacks,
): WebGLRenderer | null {
  try {
    return new WebGLRenderer(canvas, {
      renderScale,
      devicePixelRatio: runtime.devicePixelRatio,
      onContextLost: callbacks.onContextLost,
      onContextResourcesRestored: callbacks.onContextResourcesRestored,
      onContextRestored: callbacks.onContextRestored,
      onContextRestoreError: callbacks.onContextRestoreError,
    });
  } catch (error) {
    if (
      error instanceof GlassError
      && error.code === 'WEBGL2_UNSUPPORTED'
      && options.enableFallback !== false
    ) {
      return null;
    }
    throw error;
  }
}
