import type { TextureDirtyReason } from '../types/context';
import {
  rethrowAfterRunningTasks,
  runTasksPreservingFirstFailure,
} from '../utils/run-tasks';
import { findClippingAncestors } from './capture-viewport-policy';
import type { ObserverResourceState } from './diagnostics-internal';
import type { BackdropRegistration } from './registrations';
import { isDomBackdropRegistration } from './registrations';
import type { GlassEngineRuntime } from './runtime';

interface SourceObservation {
  imageCleanups: Array<() => void>;
  lastPosition: { x: number; y: number };
  mutationObserver: MutationObserver | null;
  positionObserver: MutationObserver | null;
  positionTarget: Node | null;
  registration: BackdropRegistration;
  resizeObserver: ResizeObserver | null;
}

/** Callback invoked when an observed source requires new pixels or geometry. */
export type SourceInvalidationCallback = (
  registration: BackdropRegistration,
  reason: TextureDirtyReason,
  recapture: boolean,
) => void;

/**
 * Own source-level observers and DOM image listeners for backdrop sources.
 *
 * Reconfiguration always disconnects prior handles first so reactive adapter
 * updates cannot accumulate observers or retain detached source elements.
 */
export class SourceObserverRegistry {
  private readonly observations = new Map<string, SourceObservation>();

  /** Create a registry around injected browser observer factories. */
  public constructor(
    private readonly runtime: GlassEngineRuntime,
    private readonly onInvalidate: SourceInvalidationCallback,
  ) {}

  /** Start observing a newly registered backdrop source. */
  public track(registration: BackdropRegistration): void {
    this.untrack(registration);
    const rect = registration.config.element.getBoundingClientRect();
    const observation: SourceObservation = {
      imageCleanups: [],
      lastPosition: { x: rect.x, y: rect.y },
      mutationObserver: null,
      positionObserver: null,
      positionTarget: null,
      registration,
      resizeObserver: null,
    };
    this.observations.set(registration.id, observation);
    try {
      this.configureResizeObservation(observation);
      this.configureMutationObservation(observation);
      this.configurePositionObservation(observation);
    } catch (error) {
      rethrowAfterRunningTasks(error, [() => this.untrack(registration)]);
    }
  }

  /** Recreate observation handles after source options change. */
  public update(registration: BackdropRegistration): void {
    this.track(registration);
  }

  /** Disconnect every handle associated with one source. */
  public untrack(registration: BackdropRegistration): void {
    const observation = this.observations.get(registration.id);
    if (!observation) {
      return;
    }
    this.observations.delete(registration.id);
    runTasksPreservingFirstFailure(this.takeCleanupTasks(observation));
  }

  /** Disconnect all observers and event listeners owned by this registry. */
  public destroy(): void {
    const observations = [...this.observations.values()];
    this.observations.clear();
    runTasksPreservingFirstFailure(
      observations.flatMap((observation) => this.takeCleanupTasks(observation)),
    );
  }

  /** Return aggregate observer and image-listener counts for diagnostics. */
  public getDiagnosticsState(): ObserverResourceState {
    let eventListeners = 0;
    let resizeObservers = 0;
    let mutationObservers = 0;
    for (const observation of this.observations.values()) {
      eventListeners += observation.imageCleanups.length;
      resizeObservers += Number(observation.resizeObserver !== null);
      mutationObservers += Number(observation.mutationObserver !== null);
      mutationObservers += Number(observation.positionObserver !== null);
    }
    return {
      eventListeners,
      resizeObservers,
      mutationObservers,
      intersectionObservers: 0,
    };
  }

  private configureResizeObservation(observation: SourceObservation): void {
    const { registration } = observation;
    const watchSource = isDomBackdropRegistration(registration)
      ? registration.config.watchResize !== false
      : registration.config.watchResize === true;
    const clippingAncestors = isDomBackdropRegistration(registration)
      ? findClippingAncestors(registration.config.element, this.runtime)
      : [];
    if (!watchSource && clippingAncestors.length === 0) {
      return;
    }
    const observer = this.createResizeObserver(() => {
      if (!registration.destroyed) {
        this.onInvalidate(registration, 'layout', true);
      }
    });
    if (!observer) {
      return;
    }
    observation.resizeObserver = observer;
    if (watchSource) {
      observer.observe(registration.config.element);
      if (isDomBackdropRegistration(registration)) {
        const firstChild = registration.config.element.firstElementChild;
        if (firstChild) {
          observer.observe(firstChild);
        }
      }
    }
    for (const ancestor of clippingAncestors) {
      observer.observe(ancestor.element);
    }
  }

  private configureMutationObservation(observation: SourceObservation): void {
    const { registration } = observation;
    if (
      !isDomBackdropRegistration(registration)
      || registration.config.watchNodeChanges === false
    ) {
      return;
    }
    const observer = this.createMutationObserver(() => {
      if (registration.destroyed) {
        return;
      }
      observation.resizeObserver?.disconnect();
      observation.resizeObserver = null;
      this.configureResizeObservation(observation);
      this.bindImageListeners(observation);
      this.onInvalidate(registration, 'structural', true);
    });
    if (observer) {
      observation.mutationObserver = observer;
      observer.observe(registration.config.element, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
    }
    this.bindImageListeners(observation);
  }

  private configurePositionObservation(observation: SourceObservation): void {
    const { registration } = observation;
    const enabled = registration.config.watchPositionChanges === true;
    if (!enabled) {
      return;
    }
    const observer = this.createMutationObserver(() => {
      if (registration.destroyed) {
        return;
      }
      const rect = registration.config.element.getBoundingClientRect();
      const moved = Math.abs(rect.x - observation.lastPosition.x) > 0.5
        || Math.abs(rect.y - observation.lastPosition.y) > 0.5;
      observation.lastPosition = { x: rect.x, y: rect.y };
      if (moved) {
        this.onInvalidate(registration, 'layout', false);
      }
      const nextTarget = registration.config.element.parentElement
        ?? registration.config.element;
      if (nextTarget !== observation.positionTarget) {
        observation.positionObserver?.disconnect();
        observation.positionObserver = null;
        observation.positionTarget = null;
        this.configurePositionObservation(observation);
      }
    });
    if (!observer) {
      return;
    }
    observation.positionObserver = observer;
    observation.positionTarget = registration.config.element.parentElement
      ?? registration.config.element;
    observer.observe(observation.positionTarget, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  private bindImageListeners(observation: SourceObservation): void {
    runTasksPreservingFirstFailure(this.takeImageCleanupTasks(observation));
    const { registration } = observation;
    if (!isDomBackdropRegistration(registration)) {
      return;
    }
    for (const image of registration.config.element.querySelectorAll('img')) {
      const listener: EventListener = () => {
        if (!registration.destroyed) {
          this.onInvalidate(registration, 'structural', true);
        }
      };
      observation.imageCleanups.push(this.listen(image, 'load', listener));
    }
  }

  private takeCleanupTasks(observation: SourceObservation): Array<() => void> {
    const resizeObserver = observation.resizeObserver;
    const mutationObserver = observation.mutationObserver;
    const positionObserver = observation.positionObserver;
    observation.resizeObserver = null;
    observation.mutationObserver = null;
    observation.positionObserver = null;
    observation.positionTarget = null;
    return [
      () => resizeObserver?.disconnect(),
      () => mutationObserver?.disconnect(),
      () => positionObserver?.disconnect(),
      ...this.takeImageCleanupTasks(observation),
    ];
  }

  private takeImageCleanupTasks(
    observation: SourceObservation,
  ): Array<() => void> {
    return observation.imageCleanups.splice(0);
  }

  private createResizeObserver(
    callback: ResizeObserverCallback,
  ): ResizeObserver | null {
    if (this.runtime.createResizeObserver) {
      return this.runtime.createResizeObserver(callback);
    }
    return typeof globalThis.ResizeObserver === 'function'
      ? new globalThis.ResizeObserver(callback)
      : null;
  }

  private createMutationObserver(callback: MutationCallback): MutationObserver | null {
    if (this.runtime.createMutationObserver) {
      return this.runtime.createMutationObserver(callback);
    }
    return typeof globalThis.MutationObserver === 'function'
      ? new globalThis.MutationObserver(callback)
      : null;
  }

  private listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
  ): () => void {
    if (this.runtime.addEventListener) {
      return this.runtime.addEventListener(target, type, listener);
    }
    target.addEventListener(type, listener);
    return () => target.removeEventListener(type, listener);
  }
}
