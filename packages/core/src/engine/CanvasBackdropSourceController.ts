import type {
  BackdropSourceChanges,
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  TextureDirtyReason,
} from '../types/context';
import {
  rethrowAfterRunningTasks,
  runTasksPreservingFirstFailure,
} from '../utils/run-tasks';
import { generateUUID } from '../utils/uuid';
import {
  prepareCanvasBackdropSourceUpdate,
  snapshotCanvasBackdropSourceConfig,
} from './backdrop-config';
import type {
  BackdropRegistration,
  CanvasBackdropRegistration,
} from './registrations';
import { CanvasBackdropRegistrationHandle } from './registrations';
import type { GlassEngineRuntime } from './runtime';

/** Context callbacks required by custom canvas source registrations. */
export interface CanvasBackdropSourceCallbacks {
  /** Assert that a registration still belongs to a usable context. */
  assertRegistration(registration: CanvasBackdropRegistration): void;
  /** Attach automatic source observation. */
  sourceAdded(registration: CanvasBackdropRegistration): void;
  /** Release automatic source observation. */
  sourceRemoved(registration: CanvasBackdropRegistration): void;
  /** Rebind automatic source observation after option changes. */
  sourceUpdated(registration: CanvasBackdropRegistration): void;
  /** Recompose the context without invalidating DOM captures. */
  requestComposite(reason: TextureDirtyReason): void;
}

/** Own custom canvas source handles, dirty state, and lifecycle rollback. */
export class CanvasBackdropSourceController {
  /** Create a controller around one context's shared source registry. */
  public constructor(
    private readonly sources: Map<string, BackdropRegistration>,
    private readonly runtime: GlassEngineRuntime,
    private readonly callbacks: CanvasBackdropSourceCallbacks,
  ) {}

  /** Register a core-owned custom canvas source. */
  public add(
    config: CanvasBackdropSourceConfig,
  ): BackdropSourceHandle<CanvasBackdropSourceConfig> {
    const registration: CanvasBackdropRegistration = {
      id: generateUUID(),
      config: snapshotCanvasBackdropSourceConfig(config),
      canvas: this.runtime.createCanvas(),
      dirty: true,
      drawVersion: 0,
      destroyed: false,
    };
    this.sources.set(registration.id, registration);
    const handle = new CanvasBackdropRegistrationHandle(registration, {
      update: (changes) => this.update(registration, changes),
      refresh: () => this.refresh(registration),
      destroy: () => this.remove(registration),
    });
    try {
      this.callbacks.sourceAdded(registration);
      this.callbacks.requestComposite('structural');
      return handle;
    } catch (error) {
      rethrowAfterRunningTasks(error, [
        () => {
          registration.destroyed = true;
          this.sources.delete(registration.id);
        },
        () => this.callbacks.sourceRemoved(registration),
      ]);
    }
  }

  private update(
    registration: CanvasBackdropRegistration,
    changes: BackdropSourceChanges<CanvasBackdropSourceConfig>,
  ): void {
    this.callbacks.assertRegistration(registration);
    const prepared = prepareCanvasBackdropSourceUpdate(registration.config, changes);
    if (!prepared) return;
    const previousConfig = registration.config;
    registration.config = prepared.next;
    try {
      this.callbacks.sourceUpdated(registration);
    } catch (error) {
      registration.config = previousConfig;
      rethrowAfterRunningTasks(error, [
        () => this.callbacks.sourceUpdated(registration),
      ]);
    }
    registration.dirty = true;
    registration.drawVersion += 1;
    this.callbacks.requestComposite('external');
  }

  private refresh(registration: CanvasBackdropRegistration): void {
    this.callbacks.assertRegistration(registration);
    registration.dirty = true;
    registration.drawVersion += 1;
    this.callbacks.requestComposite('external');
  }

  private remove(registration: CanvasBackdropRegistration): void {
    if (registration.destroyed) {
      return;
    }
    registration.destroyed = true;
    this.sources.delete(registration.id);
    runTasksPreservingFirstFailure([
      () => this.callbacks.sourceRemoved(registration),
      () => this.callbacks.requestComposite('structural'),
    ]);
  }
}
