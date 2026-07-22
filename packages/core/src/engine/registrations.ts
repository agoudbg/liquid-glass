import type {
  BackdropSourceChanges,
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  MaterialChanges,
  MaterialConfig,
  MaterialHandle,
} from '../types/context';
import type { InteractionState } from '../types/interaction';

/** Mutable canvas-backdrop registration owned by one context. */
export interface CanvasBackdropRegistration {
  /** Stable registration identifier. */
  id: string;
  /** Current source configuration. */
  config: CanvasBackdropSourceConfig;
  /** Core-owned local source canvas. */
  canvas: HTMLCanvasElement;
  /** Whether the registration has been released. */
  destroyed: boolean;
}

/** Mutable material registration owned by one context. */
export interface MaterialRegistration {
  /** Stable registration identifier. */
  id: string;
  /** Current material configuration. */
  config: MaterialConfig;
  /** Latest framework interaction input reserved for P5 integration. */
  interactionState: InteractionState | null;
  /** Whether the registration has been released. */
  destroyed: boolean;
}

/** Lifecycle callbacks required by a canvas-backdrop handle. */
export interface CanvasBackdropHandleCallbacks {
  /** Apply source changes. */
  update(changes: BackdropSourceChanges<CanvasBackdropSourceConfig>): void;
  /** Request a redraw. */
  refresh(): void;
  /** Release the source. */
  destroy(): void;
}

/** Public handle backed by a context-owned canvas source registration. */
export class CanvasBackdropRegistrationHandle implements BackdropSourceHandle<CanvasBackdropSourceConfig> {
  /** Stable registration identifier. */
  public get id(): string {
    return this.registration.id;
  }

  /** Whether this registration has been released. */
  public get destroyed(): boolean {
    return this.registration.destroyed;
  }

  /** Create a source handle around context-owned callbacks. */
  public constructor(
    private readonly registration: CanvasBackdropRegistration,
    private readonly callbacks: CanvasBackdropHandleCallbacks,
  ) {}

  /** Apply validated mutable source fields. */
  public update(
    changes: BackdropSourceChanges<CanvasBackdropSourceConfig>,
  ): void {
    this.callbacks.update(changes);
  }

  /** Redraw and re-upload the custom source. */
  public refresh(): void {
    this.callbacks.refresh();
  }

  /** Idempotently release the source registration. */
  public destroy(): void {
    this.callbacks.destroy();
  }
}

/** Lifecycle callbacks required by a material handle. */
export interface MaterialHandleCallbacks {
  /** Apply material changes. */
  update(changes: MaterialChanges): void;
  /** Store the latest interaction state. */
  setInteractionState(state: InteractionState): void;
  /** Request layout remeasurement. */
  refreshLayout(): void;
  /** Release the material. */
  destroy(): void;
}

/** Public handle backed by a context-owned material registration. */
export class MaterialRegistrationHandle implements MaterialHandle {
  /** Stable registration identifier. */
  public get id(): string {
    return this.registration.id;
  }

  /** Whether this registration has been released. */
  public get destroyed(): boolean {
    return this.registration.destroyed;
  }

  /** Create a material handle around context-owned callbacks. */
  public constructor(
    private readonly registration: MaterialRegistration,
    private readonly callbacks: MaterialHandleCallbacks,
  ) {}

  /** Apply mutable material fields. */
  public update(changes: MaterialChanges): void {
    this.callbacks.update(changes);
  }

  /** Forward framework pointer state to the owning context. */
  public setInteractionState(state: InteractionState): void {
    this.callbacks.setInteractionState(state);
  }

  /** Request material layout remeasurement. */
  public refreshLayout(): void {
    this.callbacks.refreshLayout();
  }

  /** Idempotently release the material registration. */
  public destroy(): void {
    this.callbacks.destroy();
  }
}
