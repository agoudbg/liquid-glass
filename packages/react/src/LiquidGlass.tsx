import type { GlassContext, GlassContextOptions } from '@agou/liquid-glass-core';
import { GlassEngine } from '@agou/liquid-glass-core';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { LiquidGlassContext } from './LiquidGlassContext';
import type { LiquidGlassHandle, LiquidGlassProps } from './types';

/** React context owner for one independent liquid-glass rendering surface. */
export const LiquidGlass = forwardRef<LiquidGlassHandle, LiquidGlassProps>(
  function LiquidGlass(
    {
      children,
      className,
      engine: providedEngine,
      onError,
      onReady,
      options,
      ...containerProps
    },
    forwardedRef,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [context, setContext] = useState<GlassContext | null>(null);
    const onErrorRef = useRef(onError);
    const onReadyRef = useRef(onReady);
    const initialEngineRef = useRef(providedEngine);
    const canvasZIndex = options?.canvasZIndex;
    const debug = options?.debug;
    const enableBlurredEffect = options?.enableBlurredEffect;
    const enableFallback = options?.enableFallback;
    const renderMode = options?.renderMode;
    const renderPrecision = options?.renderPrecision;
    const scrollable = options?.scrollable;
    const darkMax = options?.themeColorThresholds?.darkMax;
    const ultraDarkMax = options?.themeColorThresholds?.ultraDarkMax;
    const ultraLightMin = options?.themeColorThresholds?.ultraLightMin;
    const contextOptions = useMemo<GlassContextOptions>(() => ({
      canvasZIndex,
      debug,
      enableBlurredEffect,
      enableFallback,
      renderMode,
      renderPrecision,
      scrollable,
      themeColorThresholds: options?.themeColorThresholds
        ? { darkMax, ultraDarkMax, ultraLightMin }
        : undefined,
    }), [
      canvasZIndex,
      darkMax,
      debug,
      enableBlurredEffect,
      enableFallback,
      options?.themeColorThresholds,
      renderMode,
      renderPrecision,
      scrollable,
      ultraDarkMax,
      ultraLightMin,
    ]);
    const initialOptionsRef = useRef(contextOptions);

    useEffect(() => {
      onErrorRef.current = onError;
      onReadyRef.current = onReady;
    }, [onError, onReady]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return undefined;
      }

      const initialEngine = initialEngineRef.current;
      const engine = initialEngine ?? new GlassEngine();
      let mountedContext: GlassContext | null = null;
      try {
        mountedContext = engine.createContext(container, initialOptionsRef.current);
      } catch (error: unknown) {
        if (!initialEngine) engine.destroy();
        onErrorRef.current?.(error);
        return undefined;
      }

      setContext(mountedContext);
      try {
        onReadyRef.current?.(mountedContext);
      } catch (error: unknown) {
        mountedContext.destroy();
        setContext(null);
        if (!initialEngine) engine.destroy();
        throw error;
      }

      return () => {
        mountedContext?.destroy();
        setContext(null);
        if (!initialEngine) {
          engine.destroy();
        }
      };
    }, []);

    useEffect(() => {
      context?.updateOptions(contextOptions);
    }, [context, contextOptions]);

    useImperativeHandle(forwardedRef, () => ({
      getContext: () => context,
      refresh: () => context?.refresh(),
      refreshVisibility: () => context?.refresh('visibility'),
      getProxyTarget: () => context?.createProxyInterface() ?? null,
    }), [context]);

    const contextValue = useMemo(() => ({ context }), [context]);

    return (
      <LiquidGlassContext.Provider value={contextValue}>
        <div
          {...containerProps}
          ref={containerRef}
          className={['liquid-glass-container', className].filter(Boolean).join(' ')}
        >
          {children}
        </div>
      </LiquidGlassContext.Provider>
    );
  },
);
