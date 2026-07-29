import type { GlassContext } from '@agou/liquid-glass-core';

import {
  countDiagnosticsResources,
  observeGlassContext,
} from '../shared/diagnostics';
import { isSceneId } from '../shared/scene-catalog';
import type {
  FrameworkHostCallbacks,
  FrameworkHostController,
  FrameworkHostMount,
  HostResourceAudit,
  HostRuntimeReport,
  PlaygroundState,
} from '../shared/types';
import { getWorkbenchTabDefaultScene } from '../shared/workbench-tabs';
import { bindLabControls } from './lab-controller';
import {
  clonePlaygroundState,
  createInitialState,
  type PlaygroundStateChanges,
  replacePlaygroundUrl,
  transitionPlaygroundScene,
  transitionPlaygroundState,
} from './state';
import { bindWorkbenchTabs } from './tab-controller';
import { PlaygroundShellView } from './view';

/** Lifecycle owner returned by the framework-neutral shell bootstrap. */
export interface PlaygroundShellController {
  /** Isolated snapshot of the latest URL-addressable state. */
  readonly state: PlaygroundState;
  /** Remove shell listeners, diagnostics, and the active framework host. */
  destroy(): void;
}

/** Mount host lifecycle, shell controls, and diagnostics into a populated app root. */
export function bootstrapPlaygroundShell(app: HTMLElement): PlaygroundShellController {
  const view = new PlaygroundShellView(app);
  const hostModules = import.meta.glob<{ default: FrameworkHostMount }>(
    '../hosts/*/mount.{ts,tsx}',
    { eager: true },
  );
  const requireHostMount = (path: string): FrameworkHostMount => {
    const hostModule = hostModules[path];
    if (!hostModule) throw new Error(`Missing framework host module: ${path}`);
    return hostModule.default;
  };
  const mounts: Record<PlaygroundState['framework'], FrameworkHostMount> = {
    vue: requireHostMount('../hosts/vue/mount.ts'),
    react: requireHostMount('../hosts/react/mount.tsx'),
    solid: requireHostMount('../hosts/solid/mount.tsx'),
  };
  let currentState = createInitialState(new URL(window.location.href));
  let hostController: FrameworkHostController | null = null;
  let activeContext: Parameters<typeof observeGlassContext>[0] | null = null;
  let activeBackdropRefresh: (() => void) | null = null;
  let stopObservingContext: (() => void) | null = null;
  let runtimeReport = createInitializingReport();
  const mountedContexts = new Set<GlassContext>();
  const auditObserverDisposers = new Map<GlassContext, () => void>();
  let retiredContextCount = 0;
  let retiredDestroyedContextCount = 0;
  let retiredResourceCount = 0;
  let remountCount = 0;
  let destroyed = false;
  const listenerDisposers: Array<() => void> = [];

  const renderDiagnostics = (): void => {
    view.renderDiagnostics(currentState, runtimeReport, createResourceAudit());
  };
  const createResourceAudit = (): HostResourceAudit => {
    const activeSnapshots = [...mountedContexts]
      .map((context) => context.getDiagnostics())
      .filter(({ lifecycle }) => lifecycle === 'active');
    return {
      primary: activeContext?.getDiagnostics() ?? null,
      activeContextCount: activeSnapshots.length,
      liveResourceCount: activeSnapshots.reduce(
        (total, snapshot) => total + countDiagnosticsResources(snapshot),
        0,
      ),
      retiredContextCount,
      retiredDestroyedContextCount,
      retiredResourceCount,
      remountCount,
    };
  };
  const trackMountedContext = (context: GlassContext): void => {
    mountedContexts.add(context);
    if (auditObserverDisposers.has(context)) return;
    const publish = (): void => renderDiagnostics();
    const stopDiagnostics = context.on('diagnosticsUpdated', publish);
    let stopDestroyed = (): void => undefined;
    const dispose = (): void => {
      stopDiagnostics();
      stopDestroyed();
    };
    stopDestroyed = context.on('destroyed', () => {
      mountedContexts.delete(context);
      auditObserverDisposers.delete(context);
      if (activeContext === context) {
        stopObservingContext?.();
        stopObservingContext = null;
        activeContext = null;
      }
      dispose();
      renderDiagnostics();
    });
    auditObserverDisposers.set(context, dispose);
    renderDiagnostics();
  };
  const retireMountedContexts = (): void => {
    const retiring = [...mountedContexts];
    for (const dispose of auditObserverDisposers.values()) dispose();
    auditObserverDisposers.clear();
    hostController?.destroy();
    hostController = null;
    const snapshots = retiring.map((context) => context.getDiagnostics());
    retiredContextCount = snapshots.length;
    retiredDestroyedContextCount = snapshots.filter(
      ({ lifecycle }) => lifecycle === 'destroyed',
    ).length;
    retiredResourceCount = snapshots.reduce(
      (total, snapshot) => total + countDiagnosticsResources(snapshot),
      0,
    );
    mountedContexts.clear();
  };
  const backdropRefreshAvailable = (): boolean => (
    activeBackdropRefresh !== null || activeContext !== null
  );
  const refreshActiveBackdrop = (): void => {
    if (activeBackdropRefresh) {
      activeBackdropRefresh();
      return;
    }
    activeContext?.refresh('external');
  };
  const renderState = (): void => {
    view.renderState(currentState, backdropRefreshAvailable());
    renderDiagnostics();
  };
  const hostCallbacks: FrameworkHostCallbacks = {
    onContextReady: (context) => {
      if (destroyed) return;
      activeContext = context;
      trackMountedContext(context);
      view.setBackdropRefreshAvailable(true);
      stopObservingContext?.();
      stopObservingContext = observeGlassContext(context, (report) => {
        runtimeReport = report;
        renderDiagnostics();
      });
      context.setFallbackMode(currentState.fallbackEnabled);
      context.setViewportMode(currentState.viewportEnabled);
    },
    onAuxiliaryContextReady: (context) => {
      if (destroyed) return;
      trackMountedContext(context);
    },
    onBackdropRefreshReady: (refresh) => {
      if (destroyed) return;
      activeBackdropRefresh = refresh;
      view.setBackdropRefreshAvailable(backdropRefreshAvailable());
    },
    onError: (error) => {
      if (destroyed) return;
      runtimeReport = {
        ...createInitializingReport(),
        status: 'error',
        error: formatError(error),
      };
      renderDiagnostics();
    },
  };

  const mountFramework = (): void => {
    stopObservingContext?.();
    stopObservingContext = null;
    activeContext = null;
    activeBackdropRefresh = null;
    view.setBackdropRefreshAvailable(false);
    retireMountedContexts();
    runtimeReport = createInitializingReport();
    view.frameworkHost.replaceChildren();
    hostController = mounts[currentState.framework](
      view.frameworkHost,
      currentState,
      hostCallbacks,
    );
  };

  const updateState = (
    changes: PlaygroundStateChanges,
    options: { remount?: boolean } = {},
  ): void => {
    const fallbackChanged = changes.fallbackEnabled !== undefined
      && changes.fallbackEnabled !== currentState.fallbackEnabled;
    const viewportChanged = changes.viewportEnabled !== undefined
      && changes.viewportEnabled !== currentState.viewportEnabled;
    const hostStateChanged = Object.keys(changes).some(
      (key) => key !== 'fallbackEnabled',
    );
    currentState = transitionPlaygroundState(currentState, changes);
    if (options.remount) {
      mountFramework();
    } else {
      if (hostStateChanged) hostController?.update(currentState);
      if (fallbackChanged) {
        activeContext?.setFallbackMode(currentState.fallbackEnabled);
      }
      if (viewportChanged) {
        activeContext?.setViewportMode(currentState.viewportEnabled);
      }
    }
    replacePlaygroundUrl(currentState);
    renderState();
  };

  const listen = (
    target: EventTarget,
    type: string,
    listener: EventListener,
  ): void => {
    target.addEventListener(type, listener);
    listenerDisposers.push(() => target.removeEventListener(type, listener));
  };

  for (const button of view.queryElements<HTMLButtonElement>(
    'button[data-framework]',
  )) {
    listen(button, 'click', () => {
      const framework = button.dataset.framework;
      if (framework === 'vue' || framework === 'react' || framework === 'solid') {
        updateState(
          { framework },
          { remount: framework !== currentState.framework },
        );
      }
    });
  }
  listenerDisposers.push(
    bindWorkbenchTabs(app, (tab) => {
      runtimeReport = createInitializingReport();
      updateState(transitionPlaygroundScene(
        currentState,
        getWorkbenchTabDefaultScene(tab),
      ));
    }),
  );

  listen(view.sceneSelect, 'change', () => {
    const scene = view.sceneSelect.value;
    if (!isSceneId(scene)) return;
    runtimeReport = createInitializingReport();
    updateState(transitionPlaygroundScene(currentState, scene));
  });

  listen(
    view.requireElement<HTMLButtonElement>('[data-action="mutate-dom"]'),
    'click',
    () => {
      if (currentState.scene !== 'S003') return;
      updateState({
        domVariant: currentState.domVariant === 'source' ? 'mutated' : 'source',
      });
    },
  );
  listen(
    view.requireElement<HTMLButtonElement>('[data-action="remount-context"]'),
    'click',
    () => {
      if (currentState.scene !== 'S012') return;
      remountCount += 1;
      runtimeReport = createInitializingReport();
      mountFramework();
      renderState();
    },
  );
  listen(
    view.requireElement<HTMLButtonElement>('[data-action="lose-context"]'),
    'click',
    () => {
      if (currentState.scene !== 'S012') return;
      view.setContextActionStatus(
        activeContext?.requestContextLoss() === true ? 'requested' : 'unsupported',
      );
    },
  );
  listen(
    view.requireElement<HTMLButtonElement>('[data-action="restore-context"]'),
    'click',
    () => {
      if (currentState.scene !== 'S012') return;
      view.setContextActionStatus(
        activeContext?.requestContextRestore() === true ? 'requested' : 'unsupported',
      );
    },
  );
  listen(
    view.requireElement<HTMLButtonElement>('[data-action="refresh-backdrop"]'),
    'click',
    refreshActiveBackdrop,
  );

  for (const button of view.queryElements<HTMLButtonElement>('[data-fallback-mode]')) {
    listen(button, 'click', () => {
      updateState({ fallbackEnabled: button.dataset.fallbackMode === 'css' });
    });
  }
  for (const button of view.queryElements<HTMLButtonElement>('[data-viewport-mode]')) {
    listen(button, 'click', () => {
      updateState({ viewportEnabled: button.dataset.viewportMode === 'bounded' });
    });
  }
  for (const button of view.queryElements<HTMLButtonElement>('[data-render-mode]')) {
    listen(button, 'click', () => {
      updateState({
        renderMode: button.dataset.renderMode === 'dedicated'
          ? 'dedicated'
          : 'uniform',
      });
    });
  }
  listen(view.renderPrecisionInput, 'input', () => {
    const renderPrecision = Number(view.renderPrecisionInput.value);
    if (!Number.isFinite(renderPrecision)) return;
    updateState({ renderPrecision });
  });
  listen(view.debugToggle, 'change', () => {
    updateState({ debugEnabled: view.debugToggle.checked });
  });
  listenerDisposers.push(bindLabControls({
    root: app,
    getState: () => currentState,
    updateLab: (lab) => updateState({ lab }),
    refreshBackdrop: refreshActiveBackdrop,
    setCopyStatus: (message, status) => view.setCopyStatus(message, status),
  }));
  listen(view.glassToggle, 'change', () => {
    updateState({ glassEnabled: view.glassToggle.checked });
  });

  replacePlaygroundUrl(currentState);
  renderState();
  mountFramework();
  renderState();

  return {
    get state(): PlaygroundState {
      return clonePlaygroundState(currentState);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      for (const dispose of listenerDisposers.splice(0)) dispose();
      stopObservingContext?.();
      stopObservingContext = null;
      activeContext = null;
      activeBackdropRefresh = null;
      view.setBackdropRefreshAvailable(false);
      retireMountedContexts();
      renderDiagnostics();
    },
  };
}

function createInitializingReport(): HostRuntimeReport {
  return {
    status: 'initializing',
    fallbackMode: false,
    frameCount: 0,
    captureCount: 0,
    lastCapture: null,
    canvasWidth: 0,
    canvasHeight: 0,
    glError: null,
    error: null,
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown renderer error';
}
