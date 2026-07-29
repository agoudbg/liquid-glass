import type { GlassContextOptions } from '@agou/liquid-glass-core';
import {
  connectNestedGlassContexts,
  GlassEngine,
} from '@agou/liquid-glass-core';
import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  splitProps,
  untrack,
  useContext,
} from 'solid-js';

import { LiquidGlassContext } from './LiquidGlassContext';
import type { LiquidGlassHandle, LiquidGlassProps } from './types';

/** Solid context owner for one independent liquid-glass rendering surface. */
export function LiquidGlass(props: LiquidGlassProps): import('solid-js').JSX.Element {
  const [local, containerProps] = splitProps(props, [
    'apiRef',
    'children',
    'class',
    'engine',
    'onError',
    'onReady',
    'options',
  ]);
  const [context, setContext] = createSignal<
    import('@agou/liquid-glass-core').GlassContext | null
  >(null);
  const parentContextValue = useContext(LiquidGlassContext);
  let container: HTMLDivElement | undefined;
  let ownedEngine: GlassEngine | null = null;

  const handle: LiquidGlassHandle = {
    getContext: () => context(),
    refresh: () => context()?.refresh(),
    refreshVisibility: () => context()?.refresh('visibility'),
    getProxyTarget: () => context()?.createProxyInterface() ?? null,
  };
  createEffect(() => {
    const callback = local.apiRef;
    callback?.(handle);
    onCleanup(() => callback?.(null));
  });

  function readOptions(): GlassContextOptions {
    const options = local.options;
    return options
      ? {
          ...options,
          themeColorThresholds: options.themeColorThresholds
            ? { ...options.themeColorThresholds }
            : undefined,
        }
      : {};
  }

  onMount(() => {
    if (!container) {
      return;
    }

    const initialEngine = local.engine;
    const engine = initialEngine ?? new GlassEngine();
    let mountedContext: import('@agou/liquid-glass-core').GlassContext;
    try {
      mountedContext = engine.createContext(container, untrack(readOptions));
    } catch (error: unknown) {
      if (!initialEngine) engine.destroy();
      local.onError?.(error);
      return;
    }
    if (!initialEngine) ownedEngine = engine;
    setContext(mountedContext);
    local.onReady?.(mountedContext);
  });

  createEffect(() => {
    const mountedContext = context();
    if (!mountedContext) {
      return;
    }
    mountedContext.updateOptions(readOptions());
  });

  createEffect(() => {
    const parentContext = parentContextValue?.context() ?? null;
    const childContext = context();
    if (!parentContext || !childContext || !container) {
      return;
    }
    try {
      const connection = connectNestedGlassContexts(
        parentContext,
        childContext,
        container,
      );
      onCleanup(() => connection.destroy());
    } catch (error: unknown) {
      local.onError?.(error);
    }
  });

  onCleanup(() => {
    context()?.destroy();
    setContext(null);
    ownedEngine?.destroy();
    ownedEngine = null;
  });

  return (
    <LiquidGlassContext.Provider value={{ context }}>
      <div
        {...containerProps}
        ref={container}
        class={['liquid-glass-container', local.class].filter(Boolean).join(' ')}
      >
        <div
          class={[
            'liquid-glass-content',
            readOptions().scrollable ? 'scrollable' : '',
          ].filter(Boolean).join(' ')}
        >
          {local.children}
        </div>
      </div>
    </LiquidGlassContext.Provider>
  );
}
