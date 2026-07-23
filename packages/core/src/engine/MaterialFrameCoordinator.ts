import type { MaterialChanges } from '../types/context';
import { ContextFrameScheduler } from './ContextFrameScheduler';
import type { GlassEngineRuntime } from './runtime';

interface PendingMaterialUpdate {
  changes: MaterialChanges;
  fieldRevisions: Map<string, number>;
  firstRevision: number;
  maxRevision: number;
}

type MaterialUpdateBatch = Array<readonly [string, PendingMaterialUpdate]>;

function mergePendingUpdate(
  pending: PendingMaterialUpdate,
  changes: MaterialChanges,
  revision: number,
): void {
  const source = changes as unknown as Record<string, unknown>;
  const target = pending.changes as unknown as Record<string, unknown>;
  for (const field of Object.keys(changes)) {
    if (revision < (pending.fieldRevisions.get(field) ?? 0)) continue;
    target[field] = source[field];
    pending.fieldRevisions.set(field, revision);
  }
  pending.firstRevision = Math.min(pending.firstRevision, revision);
  pending.maxRevision = Math.max(pending.maxRevision, revision);
}

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
  /** Publish one coalesced material update event. */
  publishUpdate(materialId: string, changes: MaterialChanges): void;
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
  private pendingUpdates = new Map<string, PendingMaterialUpdate>();
  private currentRetiredMaterialIds: Set<string> | null = null;
  private latestCommittedRevision = 0;
  private renderedThroughRevision = 0;
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

  /** Merge one committed update into its material's pending frame event. */
  public queueUpdate(
    materialId: string,
    changes: MaterialChanges,
    revision: number,
  ): void {
    if (this.isStopped()) return;
    let pending = this.pendingUpdates.get(materialId);
    if (!pending) {
      pending = {
        changes: {},
        fieldRevisions: new Map<string, number>(),
        firstRevision: revision,
        maxRevision: revision,
      };
      this.pendingUpdates.set(materialId, pending);
    }
    mergePendingUpdate(pending, changes, revision);
    this.noteCommitted(revision);
    this.ensureFrame();
  }

  /** Record the order of a config commit before presentation can reenter. */
  public noteCommitted(revision: number): void {
    this.latestCommittedRevision = Math.max(
      this.latestCommittedRevision,
      revision,
    );
  }

  /** Record a successful external draw that included committed revisions. */
  public markRenderedThrough(revision: number): void {
    this.renderedThroughRevision = Math.max(
      this.renderedThroughRevision,
      revision,
    );
  }

  /** Execute a structural draw while consuming only pre-existing dirtiness. */
  public renderImmediately(revision: number, render: () => void): void {
    if (this.isStopped()) return;
    const renderWasRequested = this.renderRequested;
    this.renderRequested = false;
    try {
      render();
      this.markRenderedThrough(revision);
    } catch (error) {
      this.renderRequested = renderWasRequested || this.renderRequested;
      throw error;
    }
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

  /** Remove every kind of queued work owned by a retired material. */
  public retire(materialId: string): void {
    this.activeMaterialIds.delete(materialId);
    this.pendingUpdates.delete(materialId);
    this.currentRetiredMaterialIds?.add(materialId);
  }

  /** Cancel a pending frame when neither motion nor rendering needs it. */
  public cancelWhenIdle(): void {
    if (
      this.activeMaterialIds.size === 0
      && this.pendingUpdates.size === 0
      && !this.renderRequested
    ) {
      this.frameScheduler.cancel();
    }
  }

  /** Cancel scheduled work and reject every later request. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.frameScheduler.cancel();
    this.activeMaterialIds.clear();
    this.pendingUpdates.clear();
    this.renderRequested = false;
  }

  private ensureFrame(): void {
    if (this.isStopped() || this.frameScheduler.scheduled) return;
    this.frameScheduler.request((timestamp) => this.runFrame(timestamp));
  }

  private runFrame(timestamp: number): void {
    if (this.isStopped()) return;
    const updateBatch: MaterialUpdateBatch = [...this.pendingUpdates.entries()]
      .sort((left, right) => left[1].firstRevision - right[1].firstRevision);
    this.pendingUpdates = new Map<string, PendingMaterialUpdate>();
    const retiredMaterialIds = new Set<string>();
    this.currentRetiredMaterialIds = retiredMaterialIds;
    try {
      this.runDetachedFrame(timestamp, updateBatch, retiredMaterialIds);
    } finally {
      if (this.currentRetiredMaterialIds === retiredMaterialIds) {
        this.currentRetiredMaterialIds = null;
      }
    }
  }

  private runDetachedFrame(
    timestamp: number,
    updateBatch: MaterialUpdateBatch,
    retiredMaterialIds: Set<string>,
  ): void {
    let presentationChanged = false;
    let firstError: unknown;
    let failed = false;
    const dispatchedUpdateIds = new Set<string>();

    // Detaching the batch keeps reentrant updates ordered for the next frame.
    for (const [materialId, pending] of updateBatch) {
      if (retiredMaterialIds.has(materialId)) continue;
      dispatchedUpdateIds.add(materialId);
      try {
        this.callbacks.publishUpdate(materialId, pending.changes);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
      if (this.isStopped()) break;
    }

    if (this.isStopped()) {
      if (failed) throw firstError;
      return;
    }

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
          if (!failed) firstError = error;
          failed = true;
        }
        presentationChanged = true;
      }
      if (this.isStopped()) break;
      if (target.isMotionAtRest()) this.activeMaterialIds.delete(materialId);
    }

    if (this.isStopped()) {
      if (failed) throw firstError;
      return;
    }
    const hasUncoveredUpdate = updateBatch.some(([materialId, pending]) => (
      dispatchedUpdateIds.has(materialId)
      && !retiredMaterialIds.has(materialId)
      && pending.maxRevision > this.renderedThroughRevision
    ));
    const hasUncoveredPendingUpdate = [...this.pendingUpdates.values()]
      .some((pending) => pending.maxRevision > this.renderedThroughRevision);
    const shouldRender = hasUncoveredUpdate
      || hasUncoveredPendingUpdate
      || this.renderRequested
      || presentationChanged;
    this.renderRequested = false;
    if (shouldRender) {
      const coverageRevision = this.latestCommittedRevision;
      try {
        this.callbacks.renderMaterials();
        this.markRenderedThrough(coverageRevision);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
    if (
      !this.isStopped()
      && (
        this.activeMaterialIds.size > 0
        || this.pendingUpdates.size > 0
        || this.renderRequested
      )
    ) {
      try {
        this.ensureFrame();
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
    if (failed) throw firstError;
  }

  private isStopped(): boolean {
    return this.destroyed || this.callbacks.isDestroyed();
  }
}
