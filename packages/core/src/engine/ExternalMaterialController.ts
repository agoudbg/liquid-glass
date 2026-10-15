import { GlassError } from '../errors/GlassError';
import type { RendererMaterial } from '../renderer';
import type {
  ExternalMaterialConfig,
  ExternalMaterialFeedback,
  ExternalMaterialHandle,
  ProxyInterface,
} from '../types/external-material';
import { generateUUID } from '../utils/uuid';
import { resolveContextViewportScale } from './context-coordinates';
import {
  prepareExternalMaterialUpdate,
  snapshotExternalMaterialConfig,
} from './external-material-config';
import { resolveExternalRendererMaterial } from './external-material-resolver';

interface ExternalMaterialRegistration {
  id: string;
  config: ExternalMaterialConfig;
  destroyed: boolean;
  feedbackListeners: Set<(feedback: ExternalMaterialFeedback) => void>;
  lastFeedback: ExternalMaterialFeedback | null;
}

/** Context operations required by external material registrations. */
export interface ExternalMaterialControllerCallbacks {
  /** Assert that the target context still accepts registrations. */
  assertContextUsable(): void;
  /** Draw immediately after structural registration changes. */
  renderImmediately(): void;
  /** Coalesce a draw after configuration changes. */
  requestRender(): void;
  /** Report whether terminal context teardown has started. */
  isContextDestroyed(): boolean;
}

/** Detached diagnostics exposed to the owning material controller. */
export interface ExternalMaterialDiagnosticsState {
  /** Number of live externally owned materials. */
  readonly materials: number;
  /** Number of external materials visible during the latest resolve. */
  readonly materialsInViewport: number;
}

/** Own target-side proxy registration, rendering data, and feedback listeners. */
export class ExternalMaterialController {
  private readonly registrations = new Map<string, ExternalMaterialRegistration>();
  private readonly proxyInterface: ProxyInterface;
  private visibleMaterials = 0;
  private destroyed = false;

  /** Create one target-side external material owner. */
  public constructor(
    private readonly container: HTMLElement,
    private readonly content: HTMLElement,
    private readonly callbacks: ExternalMaterialControllerCallbacks,
  ) {
    this.proxyInterface = {
      getContainerRect: () => (
        this.callbacks.isContextDestroyed()
          ? null
          : this.container.getBoundingClientRect()
      ),
      getScrollPosition: () => (
        this.callbacks.isContextDestroyed()
          ? { x: 0, y: 0 }
          : { x: this.content.scrollLeft, y: this.content.scrollTop }
      ),
      registerExternalMaterial: (config) => this.register(config),
    };
  }

  /** Return the stable proxy surface exposed by the owning context. */
  public getProxyInterface(): ProxyInterface {
    return this.proxyInterface;
  }

  /** Resolve visible external materials in target registration order. */
  public resolveMaterials(
    containerRect: DOMRectReadOnly,
    contentOffset: { x: number; y: number },
  ): RendererMaterial[] {
    const materials: RendererMaterial[] = [];
    const viewportScale = resolveContextViewportScale(this.container, containerRect);
    for (const registration of this.registrations.values()) {
      if (registration.destroyed) continue;
      const material = resolveExternalRendererMaterial(
        registration.id,
        registration.config,
        containerRect,
        contentOffset,
        viewportScale,
      );
      if (material) materials.push(material);
    }
    this.visibleMaterials = materials.length;
    return materials;
  }

  /** Publish target backdrop feedback to one external owner. */
  public publishFeedback(
    materialId: string,
    feedback: ExternalMaterialFeedback,
  ): boolean {
    const registration = this.registrations.get(materialId);
    if (!registration || registration.destroyed) return false;
    if (
      registration.lastFeedback?.themeColorMode === feedback.themeColorMode
      && registration.lastFeedback.averageLuminance === feedback.averageLuminance
    ) {
      return true;
    }
    const snapshot = { ...feedback };
    registration.lastFeedback = snapshot;
    let firstError: unknown;
    let failed = false;
    for (const listener of [...registration.feedbackListeners]) {
      try {
        listener({ ...snapshot });
      } catch (error) {
        registration.feedbackListeners.delete(listener);
        if (!failed) firstError = error;
        failed = true;
      }
    }
    if (failed) throw firstError;
    return true;
  }

  /** Return detached external registration counts. */
  public getDiagnosticsState(): ExternalMaterialDiagnosticsState {
    return {
      materials: this.registrations.size,
      materialsInViewport: this.visibleMaterials,
    };
  }

  /** Release all externally owned registrations without scheduling another draw. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const registrations = [...this.registrations.values()];
    this.registrations.clear();
    this.visibleMaterials = 0;
    for (const registration of registrations) {
      registration.destroyed = true;
      registration.feedbackListeners.clear();
      registration.lastFeedback = null;
    }
  }

  private register(config: ExternalMaterialConfig): ExternalMaterialHandle {
    this.callbacks.assertContextUsable();
    const registration: ExternalMaterialRegistration = {
      id: generateUUID(),
      config: snapshotExternalMaterialConfig(config),
      destroyed: false,
      feedbackListeners: new Set(),
      lastFeedback: null,
    };
    this.registrations.set(registration.id, registration);
    const handle = this.createHandle(registration);
    try {
      this.callbacks.renderImmediately();
      return handle;
    } catch (error) {
      registration.destroyed = true;
      registration.feedbackListeners.clear();
      this.registrations.delete(registration.id);
      throw error;
    }
  }

  private createHandle(
    registration: ExternalMaterialRegistration,
  ): ExternalMaterialHandle {
    return {
      get id() {
        return registration.id;
      },
      get destroyed() {
        return registration.destroyed;
      },
      destroy: () => this.remove(registration),
      onFeedback: (callback) => this.onFeedback(registration, callback),
      update: (changes) => this.update(registration, changes),
    };
  }

  private update(
    registration: ExternalMaterialRegistration,
    changes: Partial<ExternalMaterialConfig>,
  ): void {
    this.assertRegistration(registration);
    const next = prepareExternalMaterialUpdate(registration.config, changes);
    if (!next) return;
    registration.config = next;
    this.callbacks.requestRender();
  }

  private onFeedback(
    registration: ExternalMaterialRegistration,
    callback: (feedback: ExternalMaterialFeedback) => void,
  ): () => void {
    this.assertRegistration(registration);
    registration.feedbackListeners.add(callback);
    try {
      if (registration.lastFeedback) {
        callback({ ...registration.lastFeedback });
      }
    } catch (error) {
      registration.feedbackListeners.delete(callback);
      throw error;
    }
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      registration.feedbackListeners.delete(callback);
    };
  }

  private remove(registration: ExternalMaterialRegistration): void {
    if (registration.destroyed) return;
    registration.destroyed = true;
    registration.feedbackListeners.clear();
    registration.lastFeedback = null;
    this.registrations.delete(registration.id);
    if (!this.destroyed && !this.callbacks.isContextDestroyed()) {
      this.callbacks.renderImmediately();
    }
  }

  private assertRegistration(registration: ExternalMaterialRegistration): void {
    this.callbacks.assertContextUsable();
    if (
      registration.destroyed
      || this.registrations.get(registration.id) !== registration
    ) {
      throw new GlassError(
        'LIFECYCLE_FAILED',
        'The external material registration has been destroyed.',
        { phase: 'lifecycle', materialId: registration.id },
      );
    }
  }
}
