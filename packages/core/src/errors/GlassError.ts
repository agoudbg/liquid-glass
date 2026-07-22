/**
 * Stage of the liquid-glass pipeline that produced an error.
 */
export type GlassErrorPhase =
  | 'event'
  | 'capture'
  | 'shader'
  | 'texture'
  | 'render'
  | 'interaction'
  | 'lifecycle'
  | 'configuration';

/**
 * Stable machine-readable error codes emitted by core.
 */
export type GlassErrorCode =
  | 'WEBGL2_UNSUPPORTED'
  | 'SHADER_COMPILE_FAILED'
  | 'PROGRAM_LINK_FAILED'
  | 'TEXTURE_UPLOAD_FAILED'
  | 'RENDER_FAILED'
  | 'CAPTURE_FAILED'
  | 'INVALID_CONFIG'
  | 'DESTROYED_CONTEXT'
  | 'EVENT_LISTENER_FAILED'
  | 'INTERACTION_FAILED'
  | 'LIFECYCLE_FAILED';

/**
 * Optional identifiers and diagnostics attached to a core error.
 */
export interface GlassErrorOptions {
  /** Pipeline stage responsible for the failure. */
  phase: GlassErrorPhase;
  /** Original thrown value, when one exists. */
  cause?: unknown;
  /** Material related to the failure. */
  materialId?: string;
  /** Backdrop source related to the failure. */
  backdropId?: string;
  /** Structured diagnostics safe for programmatic inspection. */
  details?: Readonly<Record<string, unknown>>;
}

/**
 * Event-safe representation of a failure with its original cause attached.
 */
export interface GlassErrorContext {
  /** Stable machine-readable error code. */
  code: GlassErrorCode;
  /** Pipeline stage responsible for the failure. */
  phase: GlassErrorPhase;
  /** Human-readable failure description. */
  message: string;
  /** Original thrown value, or the contextual error itself. */
  error: unknown;
  /** Material related to the failure. */
  materialId?: string;
  /** Backdrop source related to the failure. */
  backdropId?: string;
  /** Structured diagnostics safe for programmatic inspection. */
  details?: Readonly<Record<string, unknown>>;
}

/**
 * Contextual error used at core ownership boundaries.
 *
 * The class retains non-`Error` thrown values because browser APIs and user
 * callbacks may throw arbitrary data. Callers can either catch this error or
 * surface `toContext()` through the typed `error` event.
 */
export class GlassError extends Error {
  private readonly hasCause: boolean;

  /** Stable machine-readable error code. */
  public readonly code: GlassErrorCode;

  /** Pipeline stage responsible for the failure. */
  public readonly phase: GlassErrorPhase;

  /** Original thrown value, when one exists. */
  public readonly cause: unknown;

  /** Material related to the failure. */
  public readonly materialId: string | undefined;

  /** Backdrop source related to the failure. */
  public readonly backdropId: string | undefined;

  /** Structured diagnostics safe for programmatic inspection. */
  public readonly details: Readonly<Record<string, unknown>> | undefined;

  /**
   * Create a contextual core error.
   *
   * @param code - Stable error code.
   * @param message - Human-readable description.
   * @param options - Pipeline and resource context.
   */
  public constructor(code: GlassErrorCode, message: string, options: GlassErrorOptions) {
    super(message);
    this.name = 'GlassError';
    this.code = code;
    this.phase = options.phase;
    this.hasCause = Object.prototype.hasOwnProperty.call(options, 'cause');
    this.cause = options.cause;
    this.materialId = options.materialId;
    this.backdropId = options.backdropId;
    this.details = options.details;

    // This keeps `instanceof GlassError` reliable after older bundlers downlevel classes.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Convert the error into the payload used by `GlassEventMap.error`.
   *
   * @returns A serializable context that still retains the original cause.
   */
  public toContext(): GlassErrorContext {
    return {
      code: this.code,
      phase: this.phase,
      message: this.message,
      error: this.hasCause ? this.cause : this,
      materialId: this.materialId,
      backdropId: this.backdropId,
      details: this.details,
    };
  }

  /**
   * Preserve an existing `GlassError` or wrap an arbitrary thrown value.
   *
   * @param error - Value caught at an ownership boundary.
   * @param code - Code used when wrapping a non-contextual value.
   * @param message - Message used when wrapping a non-contextual value.
   * @param options - Context used when wrapping a non-contextual value.
   * @returns The original contextual error or a newly wrapped error.
   */
  public static fromUnknown(
    error: unknown,
    code: GlassErrorCode,
    message: string,
    options: Omit<GlassErrorOptions, 'cause'>,
  ): GlassError {
    if (error instanceof GlassError) {
      return error;
    }

    return new GlassError(code, message, { ...options, cause: error });
  }
}
