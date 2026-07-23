import { DEFAULT_MATERIAL_THEME_MODE } from '../appearance';
import { GlassError } from '../errors/GlassError';
import { InteractionEngine } from '../interaction';
import type {
  AutomaticBackgroundColorMode,
  MaterialChanges,
  MaterialConfig,
  MaterialHandle,
  MaterialPresentationListener,
  MaterialPresentationState,
} from '../types/context';
import type { InteractionState } from '../types/interaction';
import { ContextFrameScheduler } from './ContextFrameScheduler';
import {
  restoreMaterialFallbackMode,
  setMaterialFallbackMode,
} from './material-fallback';
import { normalizeMaterialPointerInput } from './material-input';
import {
  cloneMaterialPresentation,
  interactionConfigsEqual,
  interactionOutputsEqual,
} from './material-presentation-state';
import { MaterialObserverRegistry } from './MaterialObserverRegistry';
import {
  createMaterialRegistration,
  type MaterialRegistration,
  MaterialRegistrationHandle,
} from './registrations';
import type { GlassEngineRuntime } from './runtime';

interface MaterialRuntimeState {
  registration: MaterialRegistration;
  engine: InteractionEngine;
  inViewport: boolean;
  presentation: MaterialPresentationState;
  listeners: Set<MaterialPresentationListener>;
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

function createEngine(config: MaterialConfig): InteractionEngine {
  return new InteractionEngine(
    config.interactionPreset ?? 'button',
    config.interactionConfig,
  );
}

/** Owns material registrations, presentation snapshots, and one shared RAF loop. */
export class MaterialPresentationController {
  private readonly registrations = new Map<string, MaterialRuntimeState>();
  private readonly activeMaterials = new Set<string>();
  private readonly frameScheduler: ContextFrameScheduler;
  private readonly observers: MaterialObserverRegistry;
  private renderRequested = false;
  private destroyed = false;
  private fallbackMode = false;
  private blurred = false;

  /** Create a material lifecycle controller for one glass context. */
  public constructor(
    container: HTMLElement,
    runtime: GlassEngineRuntime,
    private readonly callbacks: MaterialPresentationControllerCallbacks,
  ) {
    this.frameScheduler = new ContextFrameScheduler(runtime);
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
    const engine = createEngine(registration.config);
    const materialRuntime: MaterialRuntimeState = {
      registration,
      engine,
      inViewport: true,
      listeners: new Set(),
      presentation: {
        interactionOutput: engine.getOutput(),
        interactionConfig: engine.getConfig(),
        themeColorMode: DEFAULT_MATERIAL_THEME_MODE,
        fallbackMode: this.fallbackMode,
        blurred: this.blurred,
      },
    };
    engine.setOnAnimationRequest(() => this.wake(materialRuntime));
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
      engine.destroy();
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
      materialRuntime.presentation.fallbackMode = enabled;
    }
    this.publishAll(materials);
  }

  /** Synchronize inactive-page blur state into every material presentation. */
  public setBlurred(blurred: boolean): void {
    if (this.blurred === blurred) return;
    this.blurred = blurred;
    const materials = [...this.registrations.values()];
    for (const materialRuntime of materials) {
      materialRuntime.presentation.blurred = blurred;
    }
    this.publishAll(materials);
  }

  /** Update one material's sampled theme without coupling adapters to the renderer. */
  public setTheme(
    materialId: string,
    themeColorMode: AutomaticBackgroundColorMode,
  ): void {
    const materialRuntime = this.registrations.get(materialId);
    if (!materialRuntime || materialRuntime.presentation.themeColorMode === themeColorMode) {
      return;
    }
    materialRuntime.presentation.themeColorMode = themeColorMode;
    this.publish(materialRuntime);
  }

  /** Release all engines, listeners, timers, and the shared animation frame. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observers.destroy();
    this.cancelFrame();
    for (const materialRuntime of this.registrations.values()) {
      materialRuntime.engine.destroy();
      materialRuntime.listeners.clear();
      restoreMaterialFallbackMode(materialRuntime.registration);
      materialRuntime.registration.destroyed = true;
    }
    this.activeMaterials.clear();
    this.registrations.clear();
    this.renderRequested = false;
  }

  private update(
    materialRuntime: MaterialRuntimeState,
    changes: MaterialChanges,
  ): void {
    this.assertRegistration(materialRuntime);
    const previous = materialRuntime.registration.config;
    const next = { ...previous, ...changes };
    materialRuntime.registration.config = next;
    const candidate = createEngine(next);
    const interactionChanged = !interactionConfigsEqual(
      materialRuntime.engine.getConfig(),
      candidate.getConfig(),
    );
    const interactionPolicyChanged = previous.disableInteractions !== next.disableInteractions
      || previous.onlyClickInteractions !== next.onlyClickInteractions;

    if (interactionChanged) {
      this.replaceEngine(materialRuntime, candidate);
    } else {
      candidate.destroy();
      if (interactionPolicyChanged) this.resetInteraction(materialRuntime);
    }
    this.callbacks.onUpdated(materialRuntime.registration, changes);
    this.requestRender();
  }

  private replaceEngine(
    materialRuntime: MaterialRuntimeState,
    engine: InteractionEngine,
  ): void {
    materialRuntime.engine.destroy();
    materialRuntime.engine = engine;
    materialRuntime.registration.interactionState = null;
    this.activeMaterials.delete(materialRuntime.registration.id);
    engine.setOnAnimationRequest(() => this.wake(materialRuntime));
    materialRuntime.presentation.interactionConfig = engine.getConfig();
    materialRuntime.presentation.interactionOutput = engine.getOutput();
    this.publish(materialRuntime);
  }

  private resetInteraction(materialRuntime: MaterialRuntimeState): void {
    materialRuntime.engine.reset();
    materialRuntime.registration.interactionState = null;
    this.activeMaterials.delete(materialRuntime.registration.id);
    materialRuntime.presentation.interactionOutput = materialRuntime.engine.getOutput();
    this.publish(materialRuntime);
  }

  private setInteractionState(
    materialRuntime: MaterialRuntimeState,
    state: InteractionState,
  ): void {
    this.assertRegistration(materialRuntime);
    if (materialRuntime.registration.config.disableInteractions) return;
    const data = normalizeMaterialPointerInput(state);
    const engineState = materialRuntime.engine.getState();
    if (
      engineState.isPointerDown
      && engineState.pointerId !== undefined
      && data.pointerId !== undefined
      && engineState.pointerId !== data.pointerId
    ) {
      return;
    }

    const { pointerState: pointer } = state;
    const hovering = !materialRuntime.registration.config.onlyClickInteractions
      && pointer.isHovering;
    materialRuntime.engine.setElementSize(
      state.elementRect.width,
      state.elementRect.height,
    );

    if (engineState.isPointerDown) {
      if (!hovering && engineState.isHovering) {
        materialRuntime.engine.onPointerLeave(data.pointerId);
      }
      if (pointer.isActive) {
        materialRuntime.engine.onPointerMove(data);
      } else {
        materialRuntime.engine.onPointerUp(data.pointerId);
      }
    } else if (pointer.isActive) {
      materialRuntime.engine.onPointerDown(data);
    } else if (hovering) {
      if (!engineState.isHovering) materialRuntime.engine.onPointerEnter(data);
      materialRuntime.engine.onPointerMove(data);
    } else if (engineState.isHovering) {
      materialRuntime.engine.onPointerLeave(data.pointerId);
    } else {
      return;
    }

    materialRuntime.registration.interactionState = state;
    this.wake(materialRuntime);
  }

  private getPresentation(
    materialRuntime: MaterialRuntimeState,
  ): MaterialPresentationState {
    this.assertRegistration(materialRuntime);
    return cloneMaterialPresentation(materialRuntime.presentation);
  }

  private onPresentation(
    materialRuntime: MaterialRuntimeState,
    listener: MaterialPresentationListener,
  ): () => void {
    this.assertRegistration(materialRuntime);
    materialRuntime.listeners.add(listener);
    try {
      listener(cloneMaterialPresentation(materialRuntime.presentation));
    } catch (error) {
      materialRuntime.listeners.delete(listener);
      throw error;
    }
    return () => materialRuntime.listeners.delete(listener);
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
      this.activeMaterials.delete(registration.id);
      this.requestRender();
      return;
    }

    this.requestRender();
    if (!materialRuntime.engine.isMotionAtRest()) {
      this.wake(materialRuntime);
    }
  }

  private remove(materialRuntime: MaterialRuntimeState): void {
    if (materialRuntime.registration.destroyed) return;
    this.observers.untrack(materialRuntime.registration);
    materialRuntime.engine.destroy();
    materialRuntime.listeners.clear();
    restoreMaterialFallbackMode(materialRuntime.registration);
    materialRuntime.registration.destroyed = true;
    this.activeMaterials.delete(materialRuntime.registration.id);
    this.registrations.delete(materialRuntime.registration.id);
    this.callbacks.onRemoved(materialRuntime.registration);
    if (!this.destroyed) this.callbacks.renderImmediately();
    this.cancelFrameWhenIdle();
  }

  private wake(materialRuntime: MaterialRuntimeState): void {
    if (
      this.destroyed
      || materialRuntime.registration.destroyed
      || !materialRuntime.inViewport
    ) {
      return;
    }
    if (!this.activeMaterials.has(materialRuntime.registration.id)) {
      materialRuntime.engine.resetTimestamp();
      this.activeMaterials.add(materialRuntime.registration.id);
    }
    this.ensureFrame();
  }

  private requestRender(): void {
    this.renderRequested = true;
    this.ensureFrame();
  }

  private ensureFrame(): void {
    if (this.destroyed || this.frameScheduler.scheduled) return;
    this.frameScheduler.request((timestamp) => this.runFrame(timestamp));
  }

  private runFrame(timestamp: number): void {
    if (this.destroyed) return;
    let presentationChanged = false;
    let publishError: unknown;
    let publishFailed = false;
    for (const materialId of [...this.activeMaterials]) {
      const materialRuntime = this.registrations.get(materialId);
      if (!materialRuntime) {
        this.activeMaterials.delete(materialId);
        continue;
      }
      const output = materialRuntime.engine.step(timestamp);
      if (!interactionOutputsEqual(output, materialRuntime.presentation.interactionOutput)) {
        materialRuntime.presentation.interactionOutput = output;
        try {
          this.publish(materialRuntime);
        } catch (error) {
          if (!publishFailed) publishError = error;
          publishFailed = true;
        }
        presentationChanged = true;
      }
      if (this.destroyed) break;
      if (materialRuntime.engine.isMotionAtRest()) {
        this.activeMaterials.delete(materialId);
      }
    }

    if (this.destroyed) {
      if (publishFailed) throw publishError;
      return;
    }
    const shouldRender = this.renderRequested || presentationChanged;
    this.renderRequested = false;
    if (shouldRender) this.callbacks.renderMaterials();
    if (this.activeMaterials.size > 0 || this.renderRequested) this.ensureFrame();
    if (publishFailed) throw publishError;
  }

  private publish(materialRuntime: MaterialRuntimeState): void {
    for (const listener of [...materialRuntime.listeners]) {
      try {
        listener(cloneMaterialPresentation(materialRuntime.presentation));
      } catch (error) {
        materialRuntime.listeners.delete(listener);
        throw error;
      }
      if (this.destroyed || materialRuntime.registration.destroyed) break;
    }
  }

  private publishAll(materials: MaterialRuntimeState[]): void {
    let publishError: unknown;
    let publishFailed = false;
    for (const materialRuntime of materials) {
      try {
        this.publish(materialRuntime);
      } catch (error) {
        if (!publishFailed) publishError = error;
        publishFailed = true;
      }
    }
    if (publishFailed) throw publishError;
  }

  private cancelFrameWhenIdle(): void {
    if (this.activeMaterials.size === 0 && !this.renderRequested) this.cancelFrame();
  }

  private cancelFrame(): void {
    this.frameScheduler.cancel();
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
