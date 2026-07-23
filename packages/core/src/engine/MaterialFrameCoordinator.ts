import { ContextFrameScheduler } from './ContextFrameScheduler';
import type { GlassEngineRuntime } from './runtime';

/** Minimal interaction surface advanced by the shared material frame. */
export interface MaterialFrameTarget {
  /** Report whether all motion has settled after the current step. */
  isMotionAtRest(): boolean;
  /** Publish the presentation produced by the current step. */
  publish(): void;
  /** Clear the previous frame time before joining the active set. */
  resetTimestamp(): void;
  /** Advance motion and report whether presentation output changed. */
  step(timestamp: number): boolean;
}

/** Owner services required by the material frame coordinator. */
export interface MaterialFrameCoordinatorCallbacks {
  /** Resolve the current target for an active material identifier. */
  getTarget(materialId: string): MaterialFrameTarget | null;
  /** Report whether the owning material controller has been destroyed. */
  isDestroyed(): boolean;
  /** Draw all renderable materials for one coalesced frame. */
  renderMaterials(): void;
}

/**
 * Owns the shared material active set, render dirtiness, and frame scheduler.
 *
 * The coordinator intentionally knows only material identifiers and frame
 * targets. Registration and viewport authority remain with its owner.
 */
export class MaterialFrameCoordinator {
  private readonly activeMaterialIds = new Set<string>();
  private readonly frameScheduler: ContextFrameScheduler;
  private renderRequested = false;
  private destroyed = false;

  /** Create a coordinator around the context runtime and owner callbacks. */
  public constructor(
    runtime: GlassEngineRuntime,
    private readonly callbacks: MaterialFrameCoordinatorCallbacks,
  ) {
    this.frameScheduler = new ContextFrameScheduler(runtime);
  }

  /** Schedule one coalesced material render. */
  public requestRender(): void {
    if (this.isStopped()) return;
    this.renderRequested = true;
    this.ensureFrame();
  }

  /** Join a current material target to the shared motion frame. */
  public wake(materialId: string, target: MaterialFrameTarget): void {
    if (this.isStopped() || this.callbacks.getTarget(materialId) !== target) {
      return;
    }
    if (!this.activeMaterialIds.has(materialId)) {
      target.resetTimestamp();
      this.activeMaterialIds.add(materialId);
    }
    this.ensureFrame();
  }

  /** Remove one material identifier from the active motion set. */
  public deactivate(materialId: string): void {
    this.activeMaterialIds.delete(materialId);
  }

  /** Cancel a pending frame when neither motion nor rendering needs it. */
  public cancelWhenIdle(): void {
    if (this.activeMaterialIds.size === 0 && !this.renderRequested) {
      this.frameScheduler.cancel();
    }
  }

  /** Cancel scheduled work and reject every later request. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.frameScheduler.cancel();
    this.activeMaterialIds.clear();
    this.renderRequested = false;
  }

  private ensureFrame(): void {
    if (this.isStopped() || this.frameScheduler.scheduled) return;
    this.frameScheduler.request((timestamp) => this.runFrame(timestamp));
  }

  private runFrame(timestamp: number): void {
    if (this.isStopped()) return;
    let presentationChanged = false;
    let publishError: unknown;
    let publishFailed = false;

    // A stable snapshot defers targets woken during this run to the next frame.
    for (const materialId of [...this.activeMaterialIds]) {
      const target = this.callbacks.getTarget(materialId);
      if (!target) {
        this.activeMaterialIds.delete(materialId);
        continue;
      }
      if (target.step(timestamp)) {
        try {
          target.publish();
        } catch (error) {
          if (!publishFailed) publishError = error;
          publishFailed = true;
        }
        presentationChanged = true;
      }
      if (this.isStopped()) break;
      if (target.isMotionAtRest()) this.activeMaterialIds.delete(materialId);
    }

    if (this.isStopped()) {
      if (publishFailed) throw publishError;
      return;
    }
    const shouldRender = this.renderRequested || presentationChanged;
    this.renderRequested = false;
    if (shouldRender) this.callbacks.renderMaterials();
    if (this.activeMaterialIds.size > 0 || this.renderRequested) {
      this.ensureFrame();
    }
    if (publishFailed) throw publishError;
  }

  private isStopped(): boolean {
    return this.destroyed || this.callbacks.isDestroyed();
  }
}
