import { GlassError } from '../errors/GlassError';
import type { RendererMaterial } from '../renderer';
import type {
  AutomaticBackgroundColorMode,
  MaterialChanges,
  MaterialConfig,
  MaterialHandle,
  MaterialPresentationListener,
  MaterialPresentationState,
} from '../types/context';
import type {
  ExternalMaterialFeedback,
  ProxyInterface,
} from '../types/external-material';
import type { InteractionState } from '../types/interaction';
import {
  rethrowAfterRunningTasks,
  runTasksPreservingFirstFailure,
} from '../utils/run-tasks';
import type { MaterialPresentationDiagnosticsState } from './diagnostics-internal';
import { ExternalMaterialController } from './ExternalMaterialController';
import { prepareMaterialUpdate } from './material-config';
import {
  restoreMaterialFallbackMode,
  setMaterialFallbackMode,
} from './material-fallback';
import { MaterialDelegationController } from './MaterialDelegationController';
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
  /** Report whether owning context teardown has started. */
  isContextDestroyed(): boolean;
  /** Emit a material-added event. */
  onAdded(registration: MaterialRegistration): void;
  /** Emit a material-removed event. */
  onRemoved(registration: MaterialRegistration): void;
  /** Emit a material-updated event. */
  onUpdated(registration: MaterialRegistration, changes: MaterialChanges): void;
  /** Emit target-derived theme feedback for a source material. */
  onFeedback(materialId: string, feedback: ExternalMaterialFeedback): void;
  /** Surface an asynchronous outgoing-delegation failure. */
  onError(error: GlassError): void;
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
  private readonly externalMaterials: ExternalMaterialController;
  private readonly delegations: MaterialDelegationController;
  private latestCommittedRevision = 0;
  private destroyed = false;
  private fallbackMode = false;
  private blurred = false;

  /** Create a material lifecycle controller for one glass context. */
  public constructor(
    container: HTMLElement,
    content: HTMLElement,
    runtime: GlassEngineRuntime,
    private readonly callbacks: MaterialPresentationControllerCallbacks,
  ) {
    this.frames = new MaterialFrameCoordinator(runtime, {
      getTarget: (materialId) => (
        this.registrations.get(materialId)?.interaction ?? null
      ),
      isDestroyed: () => this.destroyed,
      publishUpdate: (materialId, changes) => {
        const materialRuntime = this.registrations.get(materialId);
        if (!materialRuntime || materialRuntime.registration.destroyed) return;
        this.callbacks.onUpdated(materialRuntime.registration, changes);
      },
      renderMaterials: () => this.callbacks.renderMaterials(),
    });
    this.delegations = new MaterialDelegationController(runtime, {
      onError: (error) => this.callbacks.onError(error),
      onFeedback: (registration, feedback) => (
        this.applyDelegatedFeedback(registration, feedback)
      ),
      requestRender: () => this.requestRender(),
    });
    this.externalMaterials = new ExternalMaterialController(
      container,
      content,
      {
        assertContextUsable: () => this.callbacks.assertContextUsable(),
        isContextDestroyed: () => (
          this.destroyed || this.callbacks.isContextDestroyed()
        ),
        renderImmediately: () => this.renderImmediately(),
        requestRender: () => this.requestRender(),
      },
    );
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
    return [...this.registrations.values()]
      .map(({ registration }) => registration)
      .filter((registration) => !this.delegations.isDelegated(registration));
  }

  /** Return the stable target interface used by delegated material owners. */
  public createProxyInterface(): ProxyInterface {
    this.callbacks.assertContextUsable();
    return this.externalMaterials.getProxyInterface();
  }

  /** Resolve target-side externally owned materials for one renderer frame. */
  public resolveExternalMaterials(
    containerRect: DOMRectReadOnly,
    contentOffset: { x: number; y: number },
  ): RendererMaterial[] {
    return this.externalMaterials.resolveMaterials(
      containerRect,
      contentOffset,
    );
  }

  /** Return detached registration, scheduling, and observer diagnostics. */
  public getDiagnosticsState(): MaterialPresentationDiagnosticsState {
    const materials = [...this.registrations.values()];
    const external = this.externalMaterials.getDiagnosticsState();
    return {
      materials: materials.length + external.materials,
      materialsInViewport: (
        materials.filter(({ inViewport }) => inViewport).length
        + external.materialsInViewport
      ),
      pendingIdleTimers: materials.filter(
        ({ interaction }) => interaction.hasPendingTimer(),
      ).length,
      frames: this.frames.getDiagnosticsState(),
      delegation: this.delegations.getDiagnosticsState(),
      resources: this.observers.getDiagnosticsState(),
    };
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
      this.delegations.track(registration, () => interaction.getPresentation());
      this.renderImmediately();
      return handle;
    } catch (error) {
      registration.destroyed = true;
      this.registrations.delete(registration.id);
      rethrowAfterRunningTasks(error, [
        () => this.delegations.untrack(registration),
        () => this.observers.untrack(registration),
        () => interaction.destroy(),
        () => restoreMaterialFallbackMode(registration),
        ...announced ? [() => this.callbacks.onRemoved(registration)] : [],
      ]);
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

  /**
   * Apply sampled theme state to a local material or publish it externally.
   *
   * @returns The changed local registration, or null for external/unchanged samples.
   */
  public applyThemeSample(
    materialId: string,
    themeColorMode: AutomaticBackgroundColorMode,
    averageLuminance: number,
  ): MaterialRegistration | null {
    const materialRuntime = this.registrations.get(materialId);
    if (materialRuntime) {
      if (!materialRuntime.interaction.setTheme(themeColorMode)) return null;
      materialRuntime.interaction.publish();
      return materialRuntime.registration;
    }
    this.externalMaterials.publishFeedback(materialId, {
      themeColorMode,
      averageLuminance,
    });
    return null;
  }

  /** Release all engines, listeners, timers, and the shared animation frame. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const materials = [...this.registrations.values()];
    this.registrations.clear();
    for (const materialRuntime of materials) {
      materialRuntime.registration.destroyed = true;
    }
    runTasksPreservingFirstFailure([
      () => this.observers.destroy(),
      () => this.delegations.destroy(),
      () => this.externalMaterials.destroy(),
      () => this.frames.destroy(),
      ...materials.flatMap((materialRuntime) => [
        () => materialRuntime.interaction.destroy(),
        () => restoreMaterialFallbackMode(materialRuntime.registration),
      ]),
    ]);
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
    const revision = this.latestCommittedRevision + 1;
    this.latestCommittedRevision = revision;
    this.frames.noteCommitted(revision);
    let firstError: unknown;
    let failed = false;

    try {
      materialRuntime.interaction.commitUpdate(interactionUpdate);
    } catch (error) {
      firstError = error;
      failed = true;
    }
    try {
      this.delegations.sync(
        materialRuntime.registration,
        () => materialRuntime.interaction.getPresentation(),
      );
    } catch (error) {
      if (!failed) firstError = error;
      failed = true;
    }
    if (!this.destroyed && !materialRuntime.registration.destroyed) {
      try {
        this.frames.queueUpdate(
          materialRuntime.registration.id,
          prepared.changes,
          revision,
        );
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
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
    this.delegations.sync(
      materialRuntime.registration,
      () => materialRuntime.interaction.getPresentation(),
    );
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
    this.frames.retire(materialRuntime.registration.id);
    materialRuntime.registration.destroyed = true;
    this.registrations.delete(materialRuntime.registration.id);
    runTasksPreservingFirstFailure([
      () => this.delegations.untrack(materialRuntime.registration),
      () => materialRuntime.interaction.destroy(),
      () => restoreMaterialFallbackMode(materialRuntime.registration),
      () => this.callbacks.onRemoved(materialRuntime.registration),
      ...this.destroyed ? [] : [() => this.renderImmediately()],
    ]);
  }

  private applyDelegatedFeedback(
    registration: MaterialRegistration,
    feedback: ExternalMaterialFeedback,
  ): void {
    const materialRuntime = this.registrations.get(registration.id);
    if (
      !materialRuntime
      || materialRuntime.registration !== registration
      || registration.destroyed
      || !materialRuntime.interaction.setTheme(feedback.themeColorMode)
    ) {
      return;
    }
    materialRuntime.interaction.publish();
    this.callbacks.onFeedback(registration.id, feedback);
  }

  private renderImmediately(): void {
    const coverageRevision = this.latestCommittedRevision;
    let firstError: unknown;
    let failed = false;
    try {
      this.frames.renderImmediately(
        coverageRevision,
        () => this.callbacks.renderImmediately(),
      );
    } catch (error) {
      firstError = error;
      failed = true;
    }
    try {
      this.frames.cancelWhenIdle();
    } catch (error) {
      if (!failed) firstError = error;
      failed = true;
    }
    if (failed) throw firstError;
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
