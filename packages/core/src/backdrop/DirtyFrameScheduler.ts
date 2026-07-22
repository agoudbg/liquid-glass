import type { TextureDirtyReason } from '../types/context';

/** Browser frame operations required by the dirty-frame scheduler. */
export interface DirtyFrameSchedulerRuntime {
  /** Cancel a frame that has not started. */
  cancelAnimationFrame(handle: number): void;
  /** Schedule work for the next animation frame. */
  requestAnimationFrame(callback: FrameRequestCallback): number;
}

/** Observable scheduler state used by diagnostics and lifecycle tests. */
export interface DirtyFrameSchedulerState {
  /** Whether an animation frame is currently queued. */
  pendingFrame: boolean;
  /** Whether the asynchronous frame task is currently running. */
  running: boolean;
}

/** Asynchronous work performed for one coalesced dirty frame. */
export type DirtyFrameTask = (reason: TextureDirtyReason) => Promise<void> | void;

/** Optional error observer for asynchronous frame failures. */
export type DirtyFrameErrorHandler = (error: unknown) => void;

const DIRTY_REASON_PRIORITY: Readonly<Record<TextureDirtyReason, number>> = {
  structural: 9,
  layout: 8,
  viewport: 7,
  fallback: 6,
  visibility: 5,
  external: 4,
  unknown: 3,
  scroll: 2,
  material_interaction: 1,
};

/**
 * Coalesce invalidations to one frame while serializing asynchronous capture.
 *
 * Requests received during a capture remain queued until that capture settles.
 * This prevents overlapping DOM rasterization without dropping newer state.
 */
export class DirtyFrameScheduler {
  private readonly reasons = new Set<TextureDirtyReason>();
  private frameHandle: number | null = null;
  private running = false;
  private destroyed = false;

  /** Create a scheduler around injected frame operations and one owned task. */
  public constructor(
    private readonly runtime: DirtyFrameSchedulerRuntime,
    private readonly task: DirtyFrameTask,
    private readonly onError?: DirtyFrameErrorHandler,
  ) {}

  /** Queue an invalidation, retaining only the highest-priority frame reason. */
  public request(reason: TextureDirtyReason): void {
    if (this.destroyed) {
      return;
    }
    this.reasons.add(reason);
    if (!this.running) {
      this.scheduleFrame();
    }
  }

  /** Read current scheduling state without exposing mutable internals. */
  public getState(): DirtyFrameSchedulerState {
    return {
      pendingFrame: this.frameHandle !== null,
      running: this.running,
    };
  }

  /** Cancel queued work and ignore all future requests. */
  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.reasons.clear();
    if (this.frameHandle !== null) {
      this.runtime.cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  private scheduleFrame(): void {
    if (this.destroyed || this.frameHandle !== null || this.reasons.size === 0) {
      return;
    }
    this.frameHandle = this.runtime.requestAnimationFrame(() => {
      this.frameHandle = null;
      void this.runFrame();
    });
  }

  private async runFrame(): Promise<void> {
    if (this.destroyed || this.running || this.reasons.size === 0) {
      return;
    }

    const reason = this.takeHighestPriorityReason();
    this.reasons.clear();
    this.running = true;
    try {
      await this.task(reason);
    } catch (error) {
      if (this.onError) {
        this.onError(error);
      } else {
        throw error;
      }
    } finally {
      this.running = false;
      if (!this.destroyed) {
        this.scheduleFrame();
      }
    }
  }

  private takeHighestPriorityReason(): TextureDirtyReason {
    let selected: TextureDirtyReason = 'unknown';
    let selectedPriority = 0;
    for (const reason of this.reasons) {
      const priority = DIRTY_REASON_PRIORITY[reason];
      if (priority > selectedPriority) {
        selected = reason;
        selectedPriority = priority;
      }
    }
    return selected;
  }
}
