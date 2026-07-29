import { GlassError } from '../errors/GlassError';
import type { MaterialPresentationState } from '../types/context';
import type {
  ExternalMaterialConfig,
  ExternalMaterialFeedback,
  ExternalMaterialHandle,
  ProxyTargetInterface,
} from '../types/external-material';
import {
  rethrowAfterRunningTasks,
  runTasksPreservingFirstFailure,
} from '../utils/run-tasks';
import { ContextFrameScheduler } from './ContextFrameScheduler';
import type { MaterialDelegationDiagnosticsState } from './diagnostics-internal';
import {
  buildExternalMaterialConfig,
  delegatedLayoutChanged,
} from './material-delegation-config';
import type { MaterialRegistration } from './registrations';
import type { GlassEngineRuntime } from './runtime';

interface DelegatedMaterialState {
  readonly registration: MaterialRegistration;
  readonly getPresentation: () => MaterialPresentationState;
  readonly target: ProxyTargetInterface;
  readonly handle: ExternalMaterialHandle;
  unsubscribe: (() => void) | null;
  lastConfig: ExternalMaterialConfig;
  active: boolean;
}

/** Source-context operations required by the delegation lifecycle. */
export interface MaterialDelegationControllerCallbacks {
  /** Apply one target-derived theme sample to the source material. */
  onFeedback(
    registration: MaterialRegistration,
    feedback: ExternalMaterialFeedback,
  ): void;
  /** Surface a background synchronization failure with material context. */
  onError(error: GlassError): void;
  /** Redraw the source after an asynchronous delegation disconnect. */
  requestRender(): void;
}

function requireExternalHandle(
  value: unknown,
  materialId: string,
): ExternalMaterialHandle {
  if (typeof value !== 'object' || value === null) {
    throw new GlassError(
      'LIFECYCLE_FAILED',
      'The proxy target returned an invalid external material handle.',
      { phase: 'lifecycle', materialId },
    );
  }
  const candidate = value as Record<string, unknown>;
  for (const method of ['destroy', 'onFeedback', 'update'] as const) {
    if (typeof candidate[method] !== 'function') {
      throw new GlassError(
        'LIFECYCLE_FAILED',
        `The proxy target handle does not implement ${method}().`,
        { phase: 'lifecycle', materialId },
      );
    }
  }
  if (typeof candidate.id !== 'string' || typeof candidate.destroyed !== 'boolean') {
    throw new GlassError(
      'LIFECYCLE_FAILED',
      'The proxy target handle exposes invalid lifecycle state.',
      { phase: 'lifecycle', materialId },
    );
  }
  return value as ExternalMaterialHandle;
}

function contextualizeDelegationError(
  error: unknown,
  materialId: string,
): GlassError {
  return GlassError.fromUnknown(
    error,
    'LIFECYCLE_FAILED',
    'Failed to synchronize a delegated glass material.',
    { phase: 'lifecycle', materialId },
  );
}

/** Own outgoing proxy registrations and one shared continuous layout-sync frame. */
export class MaterialDelegationController {
  private readonly states = new Map<string, DelegatedMaterialState>();
  private readonly frame: ContextFrameScheduler;
  private destroyed = false;

  /** Create a delegation owner around the context's injected browser runtime. */
  public constructor(
    private readonly runtime: GlassEngineRuntime,
    private readonly callbacks: MaterialDelegationControllerCallbacks,
  ) {
    this.frame = new ContextFrameScheduler(runtime);
  }

  /** Establish delegation for a newly registered material when configured. */
  public track(
    registration: MaterialRegistration,
    getPresentation: () => MaterialPresentationState,
  ): void {
    const target = registration.config.proxyTarget;
    if (!target) return;
    const state = this.connect(registration, getPresentation, target);
    this.states.set(registration.id, state);
    this.ensureFrame();
  }

  /** Synchronize target identity and complete configuration after an update. */
  public sync(
    registration: MaterialRegistration,
    getPresentation: () => MaterialPresentationState,
  ): void {
    const current = this.states.get(registration.id);
    const target = registration.config.proxyTarget;
    if (!target) {
      if (current) this.untrack(registration);
      return;
    }
    if (!current || current.target !== target) {
      if (current) this.untrack(registration);
      const next = this.connect(registration, getPresentation, target);
      this.states.set(registration.id, next);
      this.ensureFrame();
      return;
    }
    const config = this.buildConfig(current);
    try {
      current.handle.update(config);
      current.lastConfig = config;
    } catch (error) {
      rethrowAfterRunningTasks(
        contextualizeDelegationError(error, registration.id),
        [() => this.disconnectFailedState(current)],
      );
    }
  }

  /** Return whether the source renderer must omit one successfully delegated material. */
  public isDelegated(registration: MaterialRegistration): boolean {
    const state = this.states.get(registration.id);
    return state?.active === true && !state.handle.destroyed;
  }

  /** Remove a material's target registration and stop the loop when it becomes idle. */
  public untrack(registration: MaterialRegistration): void {
    const state = this.states.get(registration.id);
    if (!state) return;
    this.states.delete(registration.id);
    this.disconnect(state);
    if (this.states.size === 0) this.frame.cancel();
  }

  /** Return outgoing registration and scheduler diagnostics. */
  public getDiagnosticsState(): MaterialDelegationDiagnosticsState {
    return {
      activeMaterials: this.states.size,
      frames: this.frame.getDiagnosticsState(),
    };
  }

  /** Idempotently release every target handle and pending synchronization frame. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.frame.cancel();
    const states = [...this.states.values()];
    this.states.clear();
    runTasksPreservingFirstFailure(states.map(
      (state) => () => this.disconnect(state),
    ));
  }

  private connect(
    registration: MaterialRegistration,
    getPresentation: () => MaterialPresentationState,
    target: ProxyTargetInterface,
  ): DelegatedMaterialState {
    const config = buildExternalMaterialConfig(
      registration.config,
      getPresentation(),
      this.runtime,
    );
    let handle: ExternalMaterialHandle;
    try {
      handle = requireExternalHandle(
        target.registerExternalMaterial(config),
        registration.id,
      );
    } catch (error) {
      throw contextualizeDelegationError(error, registration.id);
    }
    const state: DelegatedMaterialState = {
      registration,
      getPresentation,
      target,
      handle,
      unsubscribe: null,
      lastConfig: config,
      active: true,
    };
    try {
      state.unsubscribe = handle.onFeedback((feedback) => {
        if (!state.active || registration.destroyed) return;
        this.callbacks.onFeedback(registration, feedback);
      });
      return state;
    } catch (error) {
      state.active = false;
      rethrowAfterRunningTasks(
        contextualizeDelegationError(error, registration.id),
        [() => handle.destroy()],
      );
    }
  }

  private buildConfig(state: DelegatedMaterialState): ExternalMaterialConfig {
    return buildExternalMaterialConfig(
      state.registration.config,
      state.getPresentation(),
      this.runtime,
    );
  }

  private disconnect(state: DelegatedMaterialState): void {
    if (!state.active) return;
    state.active = false;
    runTasksPreservingFirstFailure([
      () => state.unsubscribe?.(),
      () => state.handle.destroy(),
    ]);
    state.unsubscribe = null;
  }

  private disconnectFailedState(state: DelegatedMaterialState): void {
    if (this.states.get(state.registration.id) !== state) return;
    this.states.delete(state.registration.id);
    try {
      this.disconnect(state);
    } finally {
      if (this.states.size === 0) this.frame.cancel();
    }
  }

  private ensureFrame(): void {
    if (this.destroyed || this.states.size === 0 || this.frame.scheduled) return;
    this.frame.request(() => this.runFrame());
  }

  private runFrame(): void {
    let firstError: unknown;
    let failed = false;
    for (const state of [...this.states.values()]) {
      if (!state.active || state.registration.destroyed) continue;
      try {
        const config = this.buildConfig(state);
        if (!delegatedLayoutChanged(state.lastConfig, config)) continue;
        state.handle.update({
          clientRect: config.clientRect,
          transform: config.transform,
        });
        state.lastConfig = config;
      } catch (error) {
        const contextual = contextualizeDelegationError(
          error,
          state.registration.id,
        );
        try {
          runTasksPreservingFirstFailure([
            () => this.disconnectFailedState(state),
            () => this.callbacks.requestRender(),
            () => this.callbacks.onError(contextual),
          ]);
        } catch (failure) {
          if (!failed) firstError = failure;
          failed = true;
        }
      }
    }
    this.ensureFrame();
    if (failed) throw firstError;
  }
}
