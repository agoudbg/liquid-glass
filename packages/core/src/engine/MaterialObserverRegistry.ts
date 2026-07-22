import type { MaterialRegistration } from './registrations';
import type { GlassEngineRuntime } from './runtime';

interface MaterialElementObservation {
  registrations: Set<string>;
}

/** Callback invoked when observed material geometry or DOM state may have changed. */
export type MaterialInvalidationCallback = () => void;

/**
 * Own shared resize and mutation observation for one material context.
 *
 * Observation only invalidates the material frame. Synchronous measurement and
 * culling remain in the render coordinator so observer delivery is never used
 * as authoritative layout state.
 */
export class MaterialObserverRegistry {
  private readonly elements = new Map<HTMLElement, MaterialElementObservation>();
  private readonly registrations = new Map<string, MaterialRegistration>();
  private resizeObserver: ResizeObserver | null = null;
  private resizeToken: symbol | null = null;
  private resizeInitialized = false;
  private mutationObserver: MutationObserver | null = null;
  private mutationToken: symbol | null = null;
  private destroyed = false;

  /** Create a registry around one context container and injected observer factories. */
  public constructor(
    private readonly container: HTMLElement,
    private readonly runtime: GlassEngineRuntime,
    private readonly onInvalidate: MaterialInvalidationCallback,
  ) {}

  /** Observe one material while sharing browser observers across the context. */
  public track(registration: MaterialRegistration): void {
    if (this.destroyed) {
      throw new Error('Cannot observe a material after the registry is destroyed.');
    }
    if (this.registrations.has(registration.id)) return;

    const element = registration.config.element;
    const existing = this.elements.get(element);
    const firstRegistration = this.registrations.size === 0;
    let createdMutationObserver = false;
    let observedElement = false;

    try {
      if (firstRegistration) {
        createdMutationObserver = this.ensureMutationObserver();
      }
      if (!existing) {
        this.ensureResizeObserver();
        if (this.resizeObserver) {
          observedElement = true;
          this.resizeObserver.observe(element);
        }
      }
    } catch (error) {
      if (firstRegistration) {
        this.safelyTeardownResizeObserver();
      } else if (observedElement) {
        this.releaseElementObservation(element);
      }
      if (createdMutationObserver) {
        this.safelyTeardownMutationObserver();
      }
      throw error;
    }

    const observation = existing ?? { registrations: new Set<string>() };
    observation.registrations.add(registration.id);
    this.elements.set(element, observation);
    this.registrations.set(registration.id, registration);
  }

  /** Stop observing one registration without disturbing shared element ownership. */
  public untrack(registration: MaterialRegistration): void {
    const tracked = this.registrations.get(registration.id);
    if (!tracked) return;

    this.registrations.delete(registration.id);
    const element = tracked.config.element;
    const observation = this.elements.get(element);
    observation?.registrations.delete(registration.id);

    if (this.registrations.size === 0) {
      this.elements.clear();
      this.safelyTeardownObservers();
      return;
    }
    if (observation && observation.registrations.size === 0) {
      this.elements.delete(element);
      this.releaseElementObservation(element);
    }
  }

  /** Disconnect every observer and reject callbacks delivered after teardown. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.registrations.clear();
    this.elements.clear();
    this.safelyTeardownObservers();
  }

  private ensureResizeObserver(): void {
    if (this.resizeInitialized) return;
    this.resizeInitialized = true;
    const token = Symbol('material-resize-observer');
    let observer: ResizeObserver | null;
    try {
      observer = this.createResizeObserver(() => {
        if (
          !this.destroyed
          && this.resizeToken === token
          && this.registrations.size > 0
        ) {
          this.onInvalidate();
        }
      });
    } catch (error) {
      this.resizeInitialized = false;
      throw error;
    }
    if (!observer) return;
    this.resizeObserver = observer;
    this.resizeToken = token;
  }

  private ensureMutationObserver(): boolean {
    if (this.mutationObserver) return false;
    const token = Symbol('material-mutation-observer');
    const observer = this.createMutationObserver((records) => {
      if (
        !this.destroyed
        && this.mutationToken === token
        && this.registrations.size > 0
        && this.hasRelevantMutation(records)
      ) {
        this.onInvalidate();
      }
    });
    if (!observer) return false;
    try {
      observer.observe(this.container, {
        attributeFilter: ['style', 'class', 'hidden'],
        attributes: true,
        childList: true,
        subtree: true,
      });
    } catch (error) {
      try {
        observer.disconnect();
      } catch {
        // Preserve the observe failure while dropping the failed local handle.
      }
      throw error;
    }
    this.mutationObserver = observer;
    this.mutationToken = token;
    return true;
  }

  private hasRelevantMutation(records: MutationRecord[]): boolean {
    for (const record of records) {
      if (record.type === 'childList') return true;
      if (record.type !== 'attributes') continue;
      if (record.target === this.container) return true;
      for (const element of this.elements.keys()) {
        if (record.target === element || record.target.contains(element)) {
          return true;
        }
      }
    }
    return false;
  }

  private releaseElementObservation(element: HTMLElement): void {
    try {
      this.resizeObserver?.unobserve(element);
      return;
    } catch {
      this.safelyTeardownResizeObserver();
    }

    // Preserve observation for registrations that still belong to the context.
    try {
      this.ensureResizeObserver();
      for (const trackedElement of this.elements.keys()) {
        this.resizeObserver?.observe(trackedElement);
      }
    } catch {
      this.safelyTeardownResizeObserver();
    }
  }

  private safelyTeardownObservers(): void {
    // Observer teardown is best-effort because non-standard runtime failures
    // must not prevent the other observer or owning material state from cleanup.
    this.safelyTeardownResizeObserver();
    this.safelyTeardownMutationObserver();
  }

  private safelyTeardownResizeObserver(): void {
    try {
      this.teardownResizeObserver();
    } catch {
      // Internal ownership was cleared before the non-standard runtime failure.
    }
  }

  private safelyTeardownMutationObserver(): void {
    try {
      this.teardownMutationObserver();
    } catch {
      // Internal ownership was cleared before the non-standard runtime failure.
    }
  }

  private teardownResizeObserver(): void {
    const observer = this.resizeObserver;
    this.resizeObserver = null;
    this.resizeToken = null;
    this.resizeInitialized = false;
    observer?.disconnect();
  }

  private teardownMutationObserver(): void {
    const observer = this.mutationObserver;
    this.mutationObserver = null;
    this.mutationToken = null;
    observer?.disconnect();
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
}
