import type { GlassError } from '../errors/GlassError';

interface ContextRendererLifecycleCallbacks {
  applyFallbackModeChange(): void;
  emitRestoreError(error: GlassError): void;
  invalidateBackdropTexture(): void;
  isDestroying(): boolean;
  recordContextLoss(): void;
  recordContextRestore(): void;
  refreshFallback(): void;
  setContextLost(lost: boolean): boolean;
}

/** Coordinate renderer context events without exposing renderer internals. */
export class ContextRendererLifecycleController {
  /** Bind context-loss transitions to the context-owned subsystems. */
  public constructor(
    private readonly callbacks: ContextRendererLifecycleCallbacks,
  ) {}

  /** Invalidate graphics state and enter automatic fallback after context loss. */
  public handleLost(): void {
    if (this.callbacks.isDestroying()) return;
    this.callbacks.invalidateBackdropTexture();
    const fallbackChanged = this.callbacks.setContextLost(true);
    this.callbacks.recordContextLoss();
    if (fallbackChanged) {
      this.callbacks.applyFallbackModeChange();
      this.callbacks.refreshFallback();
    }
  }

  /** Leave automatic fallback and rebuild the first restored frame. */
  public handleRestored(): void {
    if (this.callbacks.isDestroying()) return;
    if (this.callbacks.setContextLost(false)) {
      this.callbacks.applyFallbackModeChange();
    }
    this.callbacks.recordContextRestore();
    this.callbacks.refreshFallback();
  }

  /** Surface resource-rebuild failures while retaining fallback mode. */
  public handleRestoreError(error: GlassError): void {
    if (this.callbacks.isDestroying()) return;
    this.callbacks.emitRestoreError(error);
  }
}
