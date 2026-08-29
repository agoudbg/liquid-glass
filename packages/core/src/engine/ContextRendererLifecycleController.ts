import type { GlassError } from '../errors/GlassError';
import {
  rethrowAfterRunningTasks,
  runTasksPreservingFirstFailure,
} from '../utils/run-tasks';

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
    if (fallbackChanged) {
      runTasksPreservingFirstFailure([
        () => this.callbacks.applyFallbackModeChange(),
        () => this.callbacks.recordContextLoss(),
        () => this.callbacks.refreshFallback(),
      ]);
      return;
    }
    this.callbacks.recordContextLoss();
  }

  /** Commit restored presentation while renderer resources can still roll back. */
  public handleResourcesRestored(): void {
    if (this.callbacks.isDestroying()) return;
    if (!this.callbacks.setContextLost(false)) return;
    try {
      this.callbacks.applyFallbackModeChange();
    } catch (error) {
      this.callbacks.setContextLost(true);
      rethrowAfterRunningTasks(error, [
        () => this.callbacks.applyFallbackModeChange(),
      ]);
    }
  }

  /** Publish successful restoration after renderer rollback is no longer allowed. */
  public handleRestored(): void {
    if (this.callbacks.isDestroying()) return;
    runTasksPreservingFirstFailure([
      () => this.callbacks.recordContextRestore(),
      () => this.callbacks.refreshFallback(),
    ]);
  }

  /** Surface resource-rebuild failures while retaining fallback mode. */
  public handleRestoreError(error: GlassError): void {
    if (this.callbacks.isDestroying()) return;
    this.callbacks.emitRestoreError(error);
  }
}
