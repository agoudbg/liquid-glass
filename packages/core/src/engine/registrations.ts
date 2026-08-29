import type {
  BackdropSourceChanges,
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  DomBackdropSourceConfig,
  MaterialChanges,
  MaterialConfig,
  MaterialHandle,
  MaterialPresentationListener,
  MaterialPresentationState,
  ViewportCaptureRect,
} from '../types/context';
import type { InteractionState } from '../types/interaction';
import { generateUUID } from '../utils/uuid';
import { snapshotMaterialConfig } from './material-config';

/** Mutable canvas-backdrop registration owned by one context. */
export interface CanvasBackdropRegistration {
  /** Stable registration identifier. */
  id: string;
  /** Current source configuration. */
  config: CanvasBackdropSourceConfig;
  /** Core-owned local source canvas. */
  canvas: HTMLCanvasElement;
  /** Whether the drawing callback must replace the cached bitmap. */
  dirty: boolean;
  /** Monotonic draw version used to reject reentrant callback results. */
  drawVersion: number;
  /** Whether the registration has been released. */
  destroyed: boolean;
}

/** Mutable DOM-backdrop registration owned by one context. */
export interface DomBackdropRegistration {
  /** Stable registration identifier. */
  id: string;
  /** Current source configuration. */
  config: DomBackdropSourceConfig;
  /** Latest captured bitmap, or null before the first successful capture. */
  canvas: HTMLCanvasElement | null;
  /** Source-local region represented by the latest bitmap. */
  viewportRect: ViewportCaptureRect | null;
  /** Whether a new DOM rasterization is required. */
  dirty: boolean;
  /** Monotonic invalidation version used to reject stale async captures. */
  captureVersion: number;
  /** Whether the registration has been released. */
  destroyed: boolean;
}

/** Any backdrop registration owned by a context. */
export type BackdropRegistration = CanvasBackdropRegistration | DomBackdropRegistration;

/** Narrow a backdrop registration to a custom canvas source. */
export function isCanvasBackdropRegistration(
  registration: BackdropRegistration,
): registration is CanvasBackdropRegistration {
  return registration.config.kind === 'canvas';
}

/**
 * Resolve the DOM element that positions one backdrop inside its context.
 *
 * @param registration - Backdrop registration being measured.
 * @returns The explicit canvas bounds element or the source element itself.
 */
export function getBackdropBoundsElement(
  registration: BackdropRegistration,
): HTMLElement {
  return isCanvasBackdropRegistration(registration)
    ? registration.config.boundsElement ?? registration.config.element
    : registration.config.element;
}

/** Narrow a backdrop registration to a DOM capture source. */
export function isDomBackdropRegistration(
  registration: BackdropRegistration,
): registration is DomBackdropRegistration {
  return registration.config.kind === 'dom';
}

/** Mutable material registration owned by one context. */
export interface MaterialRegistration {
  /** Stable registration identifier. */
  id: string;
  /** Current material configuration. */
  config: MaterialConfig;
  /** Consumer-authored fallback marker restored when core releases the material. */
  initialFallbackAttribute: string | null;
  /** Latest accepted framework interaction input. */
  interactionState: InteractionState | null;
  /** Whether the registration has been released. */
  destroyed: boolean;
}

/** Create a detached material registration while preserving consumer markers. */
export function createMaterialRegistration(
  config: MaterialConfig,
): MaterialRegistration {
  const snapshot = snapshotMaterialConfig(config);
  return {
    id: generateUUID(),
    config: snapshot,
    initialFallbackAttribute: snapshot.element.getAttribute('is-fallback-mode'),
    interactionState: null,
    destroyed: false,
  };
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

/** Lifecycle callbacks required by a DOM-backdrop handle. */
export interface DomBackdropHandleCallbacks {
  /** Apply source changes. */
  update(changes: BackdropSourceChanges<DomBackdropSourceConfig>): void;
  /** Request a fresh rasterization. */
  refresh(): void;
  /** Release the source. */
  destroy(): void;
}

/** Public handle backed by a context-owned DOM source registration. */
export class DomBackdropRegistrationHandle implements BackdropSourceHandle<DomBackdropSourceConfig> {
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
    private readonly registration: DomBackdropRegistration,
    private readonly callbacks: DomBackdropHandleCallbacks,
  ) {}

  /** Apply validated mutable source fields. */
  public update(changes: BackdropSourceChanges<DomBackdropSourceConfig>): void {
    this.callbacks.update(changes);
  }

  /** Rasterize the DOM source again. */
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
  /** Read the current isolated presentation snapshot. */
  getPresentation(): MaterialPresentationState;
  /** Subscribe to framework-facing presentation changes. */
  onPresentation(listener: MaterialPresentationListener): () => void;
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

  /** Read the latest framework-facing presentation snapshot. */
  public getPresentation(): MaterialPresentationState {
    return this.callbacks.getPresentation();
  }

  /** Subscribe and immediately receive the latest presentation snapshot. */
  public onPresentation(listener: MaterialPresentationListener): () => void {
    return this.callbacks.onPresentation(listener);
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
