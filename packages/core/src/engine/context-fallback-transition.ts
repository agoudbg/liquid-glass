import {
  rethrowAfterRunningTasks,
  runTasksPreservingFirstFailure,
} from '../utils/run-tasks';
import type { FallbackController } from './FallbackController';

/** Fallible presentation work required to apply one effective fallback mode. */
export interface ContextFallbackTransitionCallbacks {
  /** Draw WebGL while it is still hidden before revealing the presentation. */
  preRevealRender(): void;
  /** Publish current material presentation snapshots. */
  publishMaterials(): void;
  /** Publish the committed effective context mode. */
  publishMode(enabled: boolean): void;
  /** Request the post-transition composite. */
  refresh(): void;
  /** Pause or resume DOM capture. */
  setCapturePaused(enabled: boolean): void;
  /** Synchronize material fallback presentation. */
  setMaterialMode(enabled: boolean): void;
  /** Synchronize the visible canvas and container marker. */
  setPresentationMode(enabled: boolean): void;
  /** Synchronize dedicated-canvas ownership. */
  setRenderMode(enabled: boolean): void;
}

/** Apply every presentation subsystem for an already-resolved fallback mode. */
export function applyContextFallbackPresentation(
  enabled: boolean,
  callbacks: ContextFallbackTransitionCallbacks,
): void {
  if (!enabled) callbacks.preRevealRender();
  runTasksPreservingFirstFailure([
    () => callbacks.setRenderMode(enabled),
    () => callbacks.setPresentationMode(enabled),
    () => callbacks.setCapturePaused(enabled),
    () => callbacks.setMaterialMode(enabled),
  ]);
}

/** Apply and publish the fallback controller's current effective mode. */
export function applyCurrentContextFallback(
  fallback: FallbackController,
  callbacks: ContextFallbackTransitionCallbacks,
): void {
  const enabled = fallback.effective;
  applyContextFallbackPresentation(enabled, callbacks);
  runTasksPreservingFirstFailure([
    callbacks.publishMaterials,
    () => callbacks.publishMode(enabled),
  ]);
}

/** Commit a forced fallback change or restore the prior effective presentation. */
export function transitionForcedContextFallback(
  fallback: FallbackController,
  forced: boolean,
  callbacks: ContextFallbackTransitionCallbacks,
): void {
  const previous = fallback.getSnapshot();
  if (!fallback.setForced(forced)) return;
  try {
    applyContextFallbackPresentation(fallback.effective, callbacks);
  } catch (error) {
    fallback.setForced(previous.forced);
    rethrowAfterRunningTasks(error, [
      () => applyContextFallbackPresentation(previous.effective, callbacks),
    ]);
  }
  runTasksPreservingFirstFailure([
    callbacks.publishMaterials,
    () => callbacks.publishMode(fallback.effective),
    callbacks.refresh,
  ]);
}
