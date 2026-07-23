import { observeGlassContext } from '../shared/diagnostics';
import {
  isLabNumericControl,
  updateLabNumericControl,
} from '../shared/lab-state';
import { isSceneId } from '../shared/scene-catalog';
import { isLabSceneEditable } from '../shared/scene-render-options';
import type {
  FrameworkHostCallbacks,
  FrameworkHostController,
  FrameworkHostMount,
  HostRuntimeReport,
  PlaygroundState,
} from '../shared/types';
import {
  clonePlaygroundState,
  createInitialState,
  type PlaygroundStateChanges,
  replacePlaygroundUrl,
  transitionPlaygroundScene,
  transitionPlaygroundState,
} from './state';
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
  let destroyed = false;
  const listenerDisposers: Array<() => void> = [];

  const renderDiagnostics = (): void => {
    view.renderDiagnostics(currentState, runtimeReport);
  };
  const renderState = (): void => {
    view.renderState(currentState, activeBackdropRefresh !== null);
    renderDiagnostics();
  };
  const hostCallbacks: FrameworkHostCallbacks = {
    onContextReady: (context) => {
      if (destroyed) return;
      activeContext = context;
      stopObservingContext?.();
      stopObservingContext = observeGlassContext(context, (report) => {
        runtimeReport = report;
        renderDiagnostics();
      });
      context.setFallbackMode(currentState.fallbackEnabled);
      context.setViewportMode(currentState.viewportEnabled);
    },
    onBackdropRefreshReady: (refresh) => {
      if (destroyed) return;
      activeBackdropRefresh = refresh;
      view.setBackdropRefreshAvailable(refresh !== null);
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
    hostController?.destroy();
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

  for (const button of view.queryElements<HTMLButtonElement>('[data-framework]')) {
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
    view.requireElement<HTMLButtonElement>('[data-action="refresh-backdrop"]'),
    'click',
    () => activeBackdropRefresh?.(),
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
  for (const input of view.queryElements<HTMLInputElement>('[data-control]')) {
    listen(input, 'input', () => {
      const value = Number(input.value);
      const control = input.dataset.control;
      if (!Number.isFinite(value) || !control || !isLabNumericControl(control)) {
        return;
      }
      if (!isLabSceneEditable(currentState)) {
        renderState();
        return;
      }
      updateState({
        lab: updateLabNumericControl(currentState.lab, control, value),
      });
    });
  }
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
      hostController?.destroy();
      hostController = null;
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
