import type {
  BackdropSourceChanges,
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  TextureDirtyReason,
} from '../types/context';
import { generateUUID } from '../utils/uuid';
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
      config: { ...config },
      canvas: this.runtime.createCanvas(),
      dirty: true,
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
      this.callbacks.sourceRemoved(registration);
      registration.destroyed = true;
      this.sources.delete(registration.id);
      throw error;
    }
  }

  private update(
    registration: CanvasBackdropRegistration,
    changes: BackdropSourceChanges<CanvasBackdropSourceConfig>,
  ): void {
    this.callbacks.assertRegistration(registration);
    registration.config = { ...registration.config, ...changes };
    this.callbacks.sourceUpdated(registration);
    registration.dirty = true;
    this.callbacks.requestComposite('external');
  }

  private refresh(registration: CanvasBackdropRegistration): void {
    this.callbacks.assertRegistration(registration);
    registration.dirty = true;
    this.callbacks.requestComposite('external');
  }

  private remove(registration: CanvasBackdropRegistration): void {
    if (registration.destroyed) {
      return;
    }
    registration.destroyed = true;
    this.sources.delete(registration.id);
    this.callbacks.sourceRemoved(registration);
    this.callbacks.requestComposite('structural');
  }
}
