import { DEFAULT_MATERIAL_THEME_MODE } from '../appearance';
import { InteractionEngine } from '../interaction';
import type {
  AutomaticBackgroundColorMode,
  MaterialConfig,
  MaterialPresentationListener,
  MaterialPresentationState,
} from '../types/context';
import type { InteractionState } from '../types/interaction';
import { normalizeMaterialPointerInput } from './material-input';
import { materialInteractionConfigsEqual } from './material-interaction-config';
import {
  cloneMaterialPresentation,
  interactionConfigsEqual,
  interactionOutputsEqual,
} from './material-presentation-state';
import type { MaterialRegistration } from './registrations';

/** Controller callbacks required by one material interaction runtime. */
export interface MaterialInteractionRuntimeCallbacks {
  /** Remove this material from the shared active-frame set. */
  deactivate(): void;
  /** Report whether publication must stop after the current listener. */
  shouldStopPublishing(): boolean;
  /** Wake the context-owned shared animation frame. */
  wake(): void;
}

/** Initial context presentation flags copied into one material runtime. */
export interface MaterialInteractionRuntimeOptions {
  /** Whether inactive-page styling is currently active. */
  blurred: boolean;
  /** Whether CSS fallback presentation currently replaces WebGL. */
  fallbackMode: boolean;
}

/** Candidate interaction state created before a material update is committed. */
export interface PreparedMaterialInteractionUpdate {
  /** Fully constructed candidate engine owned by this transaction. */
  candidate: InteractionEngine;
  /** Whether the resolved interaction behavior changed. */
  interactionChanged: boolean;
  /** Whether pointer acceptance policy changed. */
  interactionPolicyChanged: boolean;
  /** Whether the resolved config can update without replacing active gesture state. */
  preserveInteractionState: boolean;
  /** Canonical configuration committed with the candidate. */
  next: MaterialConfig;
}

function createEngine(config: MaterialConfig): InteractionEngine {
  const interactionConfig = config.isMoveable
    ? {
        ...config.interactionConfig,
        enableHoverFollow: false,
        translateFactor: 0,
      }
    : config.interactionConfig;
  return new InteractionEngine(
    config.interactionPreset ?? 'button',
    interactionConfig,
  );
}

/**
 * Owns one material's interaction engine and framework-facing presentation.
 *
 * Registration lifecycle, viewport state, observers, and frame scheduling stay
 * with the context controller so this runtime has no cross-material authority.
 */
export class MaterialInteractionRuntime {
  private engine: InteractionEngine;
  private readonly listeners = new Set<MaterialPresentationListener>();
  private readonly presentation: MaterialPresentationState;

  /** Create the interaction state owned by one material registration. */
  public constructor(
    private readonly registration: MaterialRegistration,
    options: MaterialInteractionRuntimeOptions,
    private readonly callbacks: MaterialInteractionRuntimeCallbacks,
  ) {
    this.engine = createEngine(registration.config);
    this.presentation = {
      interactionOutput: this.engine.getOutput(),
      interactionConfig: this.engine.getConfig(),
      themeColorMode: DEFAULT_MATERIAL_THEME_MODE,
      fallbackMode: options.fallbackMode,
      blurred: options.blurred,
    };
    this.engine.setOnAnimationRequest(() => this.callbacks.wake());
  }

  /** Construct and validate an interaction update without mutating live state. */
  public prepareUpdate(next: MaterialConfig): PreparedMaterialInteractionUpdate {
    const previous = this.registration.config;
    const candidate = createEngine(next);
    const interactionPolicyChanged = (
      previous.disableInteractions !== next.disableInteractions
      || previous.onlyClickInteractions !== next.onlyClickInteractions
    );
    try {
      return {
        candidate,
        interactionChanged: !interactionConfigsEqual(
          this.engine.getConfig(),
          candidate.getConfig(),
        ),
        interactionPolicyChanged,
        preserveInteractionState: (
          previous.isMoveable !== next.isMoveable
          && !interactionPolicyChanged
          && previous.interactionPreset === next.interactionPreset
          && materialInteractionConfigsEqual(
            previous.interactionConfig,
            next.interactionConfig,
          )
        ),
        next,
      };
    } catch (error) {
      candidate.destroy();
      throw error;
    }
  }

  /** Commit a prepared update before publishing presentation side effects. */
  public commitUpdate(update: PreparedMaterialInteractionUpdate): void {
    this.registration.config = update.next;

    if (update.interactionChanged) {
      if (update.preserveInteractionState) {
        this.updateEngineConfig(update.candidate);
      } else {
        this.replaceEngine(update.candidate);
      }
    } else {
      update.candidate.destroy();
      if (update.interactionPolicyChanged) this.resetInteraction();
    }
  }

  /** Forward validated framework pointer state into the interaction engine. */
  public setInteractionState(state: InteractionState): void {
    if (this.registration.config.disableInteractions) return;
    const data = normalizeMaterialPointerInput(state);
    const engineState = this.engine.getState();
    if (
      engineState.isPointerDown
      && engineState.pointerId !== undefined
      && data.pointerId !== undefined
      && engineState.pointerId !== data.pointerId
    ) {
      return;
    }

    const { pointerState: pointer } = state;
    const hovering = !this.registration.config.onlyClickInteractions
      && pointer.isHovering;
    this.engine.setElementSize(
      state.elementRect.width,
      state.elementRect.height,
    );

    if (engineState.isPointerDown) {
      if (!hovering && engineState.isHovering) {
        this.engine.onPointerLeave(data.pointerId);
      }
      if (pointer.isActive) {
        this.engine.onPointerMove(data);
      } else {
        this.engine.onPointerUp(data.pointerId);
      }
    } else if (pointer.isActive) {
      this.engine.onPointerDown(data);
    } else if (hovering) {
      if (!engineState.isHovering) this.engine.onPointerEnter(data);
      this.engine.onPointerMove(data);
    } else if (engineState.isHovering) {
      this.engine.onPointerLeave(data.pointerId);
    } else {
      return;
    }

    this.registration.interactionState = state;
    this.callbacks.wake();
  }

  /** Read an isolated snapshot of the current framework presentation. */
  public getPresentation(): MaterialPresentationState {
    return cloneMaterialPresentation(this.presentation);
  }

  /** Subscribe and immediately receive the current presentation snapshot. */
  public onPresentation(
    listener: MaterialPresentationListener,
  ): () => void {
    this.listeners.add(listener);
    try {
      listener(cloneMaterialPresentation(this.presentation));
    } catch (error) {
      this.listeners.delete(listener);
      throw error;
    }
    return () => this.listeners.delete(listener);
  }

  /** Store fallback state without publishing before peer materials are updated. */
  public setFallbackMode(enabled: boolean): void {
    this.presentation.fallbackMode = enabled;
  }

  /** Store inactive-page blur state before context-wide publication. */
  public setBlurred(blurred: boolean): void {
    this.presentation.blurred = blurred;
  }

  /** Replace the sampled theme and report whether presentation changed. */
  public setTheme(themeColorMode: AutomaticBackgroundColorMode): boolean {
    if (this.presentation.themeColorMode === themeColorMode) return false;
    this.presentation.themeColorMode = themeColorMode;
    return true;
  }

  /** Advance the interaction engine and store a changed presentation output. */
  public step(timestamp: number): boolean {
    const output = this.engine.step(timestamp);
    if (interactionOutputsEqual(output, this.presentation.interactionOutput)) {
      return false;
    }
    this.presentation.interactionOutput = output;
    return true;
  }

  /** Publish one isolated snapshot to listeners in registration order. */
  public publish(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(cloneMaterialPresentation(this.presentation));
      } catch (error) {
        this.listeners.delete(listener);
        throw error;
      }
      if (this.callbacks.shouldStopPublishing()) break;
    }
  }

  /** Return whether every interaction spring has settled. */
  public isMotionAtRest(): boolean {
    return this.engine.isMotionAtRest();
  }

  /** Report whether the interaction engine retains an idle-return timer. */
  public hasPendingTimer(): boolean {
    return this.engine.hasPendingTimer();
  }

  /** Clear the engine clock before the shared scheduler starts a frame run. */
  public resetTimestamp(): void {
    this.engine.resetTimestamp();
  }

  /** Release the interaction engine and every presentation listener. */
  public destroy(): void {
    this.engine.destroy();
    this.listeners.clear();
  }

  private replaceEngine(engine: InteractionEngine): void {
    this.engine.destroy();
    this.engine = engine;
    this.registration.interactionState = null;
    this.callbacks.deactivate();
    engine.setOnAnimationRequest(() => this.callbacks.wake());
    this.presentation.interactionConfig = engine.getConfig();
    this.presentation.interactionOutput = engine.getOutput();
    this.publish();
  }

  private updateEngineConfig(candidate: InteractionEngine): void {
    const config = candidate.getConfig();
    candidate.destroy();
    this.engine.setConfig(config);
    this.presentation.interactionConfig = this.engine.getConfig();
    this.publish();
  }

  private resetInteraction(): void {
    this.engine.reset();
    this.registration.interactionState = null;
    this.callbacks.deactivate();
    this.presentation.interactionOutput = this.engine.getOutput();
    this.publish();
  }
}
