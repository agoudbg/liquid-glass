import { GlassError } from '../errors/GlassError';
import type {
  AutomaticBackgroundColorMode,
  MaterialChanges,
  MaterialConfig,
  MaterialHandle,
  MaterialPresentationListener,
  MaterialPresentationState,
} from '../types/context';
import type { InteractionState } from '../types/interaction';
import { prepareMaterialUpdate } from './material-config';
import {
  restoreMaterialFallbackMode,
  setMaterialFallbackMode,
} from './material-fallback';
import { MaterialFrameCoordinator } from './MaterialFrameCoordinator';
import { MaterialInteractionRuntime } from './MaterialInteractionRuntime';
import { MaterialObserverRegistry } from './MaterialObserverRegistry';
import {
  createMaterialRegistration,
  type MaterialRegistration,
  MaterialRegistrationHandle,
} from './registrations';
import type { GlassEngineRuntime } from './runtime';

interface MaterialRuntimeState {
  registration: MaterialRegistration;
  interaction: MaterialInteractionRuntime;
  inViewport: boolean;
}

/** Context callbacks used by the material presentation lifecycle. */
export interface MaterialPresentationControllerCallbacks {
  /** Assert that the owning context still accepts work. */
  assertContextUsable(): void;
  /** Emit a material-added event. */
  onAdded(registration: MaterialRegistration): void;
  /** Emit a material-removed event. */
  onRemoved(registration: MaterialRegistration): void;
  /** Emit a material-updated event. */
  onUpdated(registration: MaterialRegistration, changes: MaterialChanges): void;
  /** Draw materials immediately for structural lifecycle changes. */
  renderImmediately(): void;
  /** Draw one coalesced material-only frame. */
  renderMaterials(): void;
}

/** Owns material registrations, presentation snapshots, and one shared RAF loop. */
export class MaterialPresentationController {
  private readonly registrations = new Map<string, MaterialRuntimeState>();
  private readonly frames: MaterialFrameCoordinator;
  private readonly observers: MaterialObserverRegistry;
  private destroyed = false;
  private fallbackMode = false;
  private blurred = false;

  /** Create a material lifecycle controller for one glass context. */
  public constructor(
    container: HTMLElement,
    runtime: GlassEngineRuntime,
    private readonly callbacks: MaterialPresentationControllerCallbacks,
  ) {
    this.frames = new MaterialFrameCoordinator(runtime, {
      getTarget: (materialId) => (
        this.registrations.get(materialId)?.interaction ?? null
      ),
      isDestroyed: () => this.destroyed,
      renderMaterials: () => this.callbacks.renderMaterials(),
    });
    this.observers = new MaterialObserverRegistry(
      container,
      runtime,
      () => this.requestRender(),
      (registration, inViewport) => this.setViewportVisibility(
        registration,
        inViewport,
      ),
    );
  }

  /** Return live registrations in stable insertion order. */
  public values(): Iterable<MaterialRegistration> {
    return [...this.registrations.values()].map(({ registration }) => registration);
  }

  /** Register one material and immediately draw its structural change. */
  public add(config: MaterialConfig): MaterialHandle {
    this.callbacks.assertContextUsable();
    const registration = createMaterialRegistration(config);
    const interaction = new MaterialInteractionRuntime(
      registration,
      {
        blurred: this.blurred,
        fallbackMode: this.fallbackMode,
      },
      {
        deactivate: () => this.frames.deactivate(registration.id),
        shouldStopPublishing: () => this.destroyed || registration.destroyed,
        wake: () => this.wake(registration),
      },
    );
    const materialRuntime: MaterialRuntimeState = {
      registration,
      interaction,
      inViewport: true,
    };
    const handle = new MaterialRegistrationHandle(registration, {
      update: (changes) => this.update(materialRuntime, changes),
      getPresentation: () => this.getPresentation(materialRuntime),
      onPresentation: (listener) => this.onPresentation(materialRuntime, listener),
      setInteractionState: (state) => this.setInteractionState(materialRuntime, state),
      refreshLayout: () => this.refreshLayout(materialRuntime),
      destroy: () => this.remove(materialRuntime),
    });

    let announced = false;
    try {
      setMaterialFallbackMode(registration, this.fallbackMode);
      this.registrations.set(registration.id, materialRuntime);
      this.observers.track(registration);
      announced = true;
      this.callbacks.onAdded(registration);
      this.callbacks.renderImmediately();
      return handle;
    } catch (error) {
      this.observers.untrack(registration);
      interaction.destroy();
      restoreMaterialFallbackMode(registration);
      registration.destroyed = true;
      this.registrations.delete(registration.id);
      if (announced) this.callbacks.onRemoved(registration);
      throw error;
    }
  }

  /** Synchronize CSS fallback state into every material presentation. */
  public setFallbackMode(enabled: boolean): void {
    if (this.fallbackMode === enabled) return;
    this.fallbackMode = enabled;
    const materials = [...this.registrations.values()];
    for (const materialRuntime of materials) {
      setMaterialFallbackMode(materialRuntime.registration, enabled);
      materialRuntime.interaction.setFallbackMode(enabled);
    }
    this.publishAll(materials);
  }

  /** Synchronize inactive-page blur state into every material presentation. */
  public setBlurred(blurred: boolean): void {
    if (this.blurred === blurred) return;
    this.blurred = blurred;
    const materials = [...this.registrations.values()];
    for (const materialRuntime of materials) {
      materialRuntime.interaction.setBlurred(blurred);
    }
    this.publishAll(materials);
  }

  /** Update one material's sampled theme without coupling adapters to the renderer. */
  public setTheme(
    materialId: string,
    themeColorMode: AutomaticBackgroundColorMode,
  ): void {
    const materialRuntime = this.registrations.get(materialId);
    if (!materialRuntime || !materialRuntime.interaction.setTheme(themeColorMode)) {
      return;
    }
    materialRuntime.interaction.publish();
  }

  /** Release all engines, listeners, timers, and the shared animation frame. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observers.destroy();
    this.frames.destroy();
    for (const materialRuntime of this.registrations.values()) {
      materialRuntime.interaction.destroy();
      restoreMaterialFallbackMode(materialRuntime.registration);
      materialRuntime.registration.destroyed = true;
    }
    this.registrations.clear();
  }

  private update(
    materialRuntime: MaterialRuntimeState,
    changes: MaterialChanges,
  ): void {
    this.assertRegistration(materialRuntime);
    const prepared = prepareMaterialUpdate(
      materialRuntime.registration.config,
      changes,
    );
    if (!prepared) return;
    const interactionUpdate = materialRuntime.interaction.prepareUpdate(prepared.next);
    let firstError: unknown;
    let failed = false;

    try {
      materialRuntime.interaction.commitUpdate(interactionUpdate);
    } catch (error) {
      firstError = error;
      failed = true;
    }
    try {
      this.callbacks.onUpdated(materialRuntime.registration, prepared.changes);
    } catch (error) {
      if (!failed) firstError = error;
      failed = true;
    }
    try {
      this.requestRender();
    } catch (error) {
      if (!failed) firstError = error;
      failed = true;
    }
    if (failed) throw firstError;
  }

  private setInteractionState(
    materialRuntime: MaterialRuntimeState,
    state: InteractionState,
  ): void {
    this.assertRegistration(materialRuntime);
    materialRuntime.interaction.setInteractionState(state);
  }

  private getPresentation(
    materialRuntime: MaterialRuntimeState,
  ): MaterialPresentationState {
    this.assertRegistration(materialRuntime);
    return materialRuntime.interaction.getPresentation();
  }

  private onPresentation(
    materialRuntime: MaterialRuntimeState,
    listener: MaterialPresentationListener,
  ): () => void {
    this.assertRegistration(materialRuntime);
    return materialRuntime.interaction.onPresentation(listener);
  }

  private refreshLayout(materialRuntime: MaterialRuntimeState): void {
    this.assertRegistration(materialRuntime);
    this.requestRender();
  }

  private setViewportVisibility(
    registration: MaterialRegistration,
    inViewport: boolean,
  ): void {
    if (this.destroyed) return;
    const materialRuntime = this.registrations.get(registration.id);
    if (
      !materialRuntime
      || materialRuntime.registration.destroyed
      || materialRuntime.inViewport === inViewport
    ) {
      return;
    }

    materialRuntime.inViewport = inViewport;
    if (!inViewport) {
      this.frames.deactivate(registration.id);
      this.requestRender();
      return;
    }

    this.requestRender();
    if (!materialRuntime.interaction.isMotionAtRest()) {
      this.wake(registration);
    }
  }

  private remove(materialRuntime: MaterialRuntimeState): void {
    if (materialRuntime.registration.destroyed) return;
    this.observers.untrack(materialRuntime.registration);
    materialRuntime.interaction.destroy();
    restoreMaterialFallbackMode(materialRuntime.registration);
    materialRuntime.registration.destroyed = true;
    this.frames.deactivate(materialRuntime.registration.id);
    this.registrations.delete(materialRuntime.registration.id);
    this.callbacks.onRemoved(materialRuntime.registration);
    if (!this.destroyed) this.callbacks.renderImmediately();
    this.frames.cancelWhenIdle();
  }

  private wake(registration: MaterialRegistration): void {
    const materialRuntime = this.registrations.get(registration.id);
    if (
      this.destroyed
      || !materialRuntime
      || materialRuntime.registration !== registration
      || registration.destroyed
      || !materialRuntime.inViewport
    ) {
      return;
    }
    this.frames.wake(registration.id, materialRuntime.interaction);
  }

  private requestRender(): void {
    this.frames.requestRender();
  }

  private publishAll(materials: MaterialRuntimeState[]): void {
    let publishError: unknown;
    let publishFailed = false;
    for (const materialRuntime of materials) {
      try {
        materialRuntime.interaction.publish();
      } catch (error) {
        if (!publishFailed) publishError = error;
        publishFailed = true;
      }
    }
    if (publishFailed) throw publishError;
  }

  private assertRegistration(materialRuntime: MaterialRuntimeState): void {
    this.callbacks.assertContextUsable();
    if (materialRuntime.registration.destroyed) {
      throw new GlassError(
        'LIFECYCLE_FAILED',
        'The material registration has already been destroyed.',
        { phase: 'lifecycle', materialId: materialRuntime.registration.id },
      );
    }
  }
}
