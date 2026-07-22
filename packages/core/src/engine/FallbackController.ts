import type { GlassContextOptions } from '../types/context';

/** Observable state owned by a {@link FallbackController}. */
export interface FallbackStateSnapshot {
  /** Whether fallback rendering is permitted for automatic failures. */
  enabled: boolean;
  /** Whether a caller explicitly requested fallback rendering. */
  forced: boolean;
  /** Whether the renderer could not be created. */
  rendererUnavailable: boolean;
  /** Whether an existing renderer lost its WebGL context. */
  contextLost: boolean;
  /** Whether fallback presentation should currently be visible. */
  effective: boolean;
}

/**
 * Resolve explicit and automatic fallback causes into one presentation state.
 *
 * Forced fallback remains effective even when automatic fallback is disabled.
 * Renderer failure and context loss are tracked independently so clearing one
 * cause cannot accidentally hide fallback while the other cause remains.
 */
export class FallbackController {
  private enabled: boolean;
  private forced = false;
  private rendererUnavailable = false;
  private contextLost = false;

  /** Create fallback state from the current context options. */
  public constructor(options: Pick<GlassContextOptions, 'enableFallback'> = {}) {
    this.enabled = options.enableFallback ?? true;
  }

  /** Whether fallback presentation should currently be visible. */
  public get effective(): boolean {
    return this.resolveEffective();
  }

  /** Return a detached snapshot suitable for diagnostics and event handling. */
  public getSnapshot(): FallbackStateSnapshot {
    return {
      enabled: this.enabled,
      forced: this.forced,
      rendererUnavailable: this.rendererUnavailable,
      contextLost: this.contextLost,
      effective: this.effective,
    };
  }

  /**
   * Replace the automatic-fallback option.
   *
   * @returns Whether the effective fallback state changed.
   */
  public updateOptions(options: Pick<GlassContextOptions, 'enableFallback'>): boolean {
    return this.setEnabled(options.enableFallback);
  }

  /**
   * Enable or disable automatic fallback, with `undefined` restoring its default.
   *
   * @returns Whether the effective fallback state changed.
   */
  public setEnabled(enabled: boolean | undefined): boolean {
    return this.mutate(() => {
      this.enabled = enabled ?? true;
    });
  }

  /**
   * Force or release fallback independently of the automatic-fallback option.
   *
   * @returns Whether the effective fallback state changed.
   */
  public setForced(forced: boolean): boolean {
    return this.mutate(() => {
      this.forced = forced;
    });
  }

  /**
   * Record whether the renderer is unavailable.
   *
   * @returns Whether the effective fallback state changed.
   */
  public setRendererUnavailable(unavailable: boolean): boolean {
    return this.mutate(() => {
      this.rendererUnavailable = unavailable;
    });
  }

  /**
   * Record whether an existing WebGL context is lost.
   *
   * @returns Whether the effective fallback state changed.
   */
  public setContextLost(lost: boolean): boolean {
    return this.mutate(() => {
      this.contextLost = lost;
    });
  }

  private resolveEffective(): boolean {
    const automaticCause = this.rendererUnavailable || this.contextLost;
    return this.forced || (this.enabled && automaticCause);
  }

  private mutate(mutation: () => void): boolean {
    const previous = this.effective;
    mutation();
    return previous !== this.effective;
  }
}
