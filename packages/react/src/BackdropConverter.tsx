import type {
  BackdropSourceChanges,
  BackdropSourceHandle,
  DomBackdropSourceConfig,
} from '@agou/liquid-glass-core';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';

import { useLiquidGlassContext } from './LiquidGlassContext';
import type {
  BackdropConverterHandle,
  BackdropConverterProps,
} from './types';

/** React DOM subtree registered as a captured backdrop with the nearest container. */
export const BackdropConverter = forwardRef<
  BackdropConverterHandle,
  BackdropConverterProps
>(function BackdropConverter(
  {
    backgroundColor,
    captureLibrary = 'html-to-image',
    children,
    className,
    scale,
    viewportCapture,
    watchNodeChanges = true,
    watchPositionChanges = true,
    watchResize = true,
    zIndex,
    ...containerProps
  },
  forwardedRef,
) {
  const { context } = useLiquidGlassContext();
  const elementRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<BackdropSourceHandle<DomBackdropSourceConfig> | null>(null);
  const changes = useMemo<BackdropSourceChanges<DomBackdropSourceConfig>>(() => ({
    backgroundColor,
    captureLibrary,
    scale,
    viewportCapture: typeof viewportCapture === 'object'
      ? { ...viewportCapture }
      : viewportCapture,
    watchNodeChanges,
    watchPositionChanges,
    watchResize,
    zIndex,
  }), [
    backgroundColor,
    captureLibrary,
    scale,
    viewportCapture,
    watchNodeChanges,
    watchPositionChanges,
    watchResize,
    zIndex,
  ]);
  const latestChangesRef = useRef(changes);
  const lastChangesRef = useRef(changes);

  useEffect(() => {
    latestChangesRef.current = changes;
  }, [changes]);

  useImperativeHandle(forwardedRef, () => ({
    getHandle: () => handleRef.current,
    refresh: () => handleRef.current?.refresh(),
  }), []);

  useEffect(() => {
    const element = elementRef.current;
    if (!context || !element) {
      return undefined;
    }

    const currentChanges = latestChangesRef.current;
    const registration = context.addBackdropSource({
      kind: 'dom',
      element,
      ...currentChanges,
    });
    handleRef.current = registration;
    lastChangesRef.current = currentChanges;
    return () => {
      registration.destroy();
      if (handleRef.current === registration) {
        handleRef.current = null;
      }
    };
  }, [context]);

  useEffect(() => {
    if (lastChangesRef.current === changes) {
      return;
    }
    lastChangesRef.current = changes;
    handleRef.current?.update(changes);
  }, [changes]);

  return (
    <div
      {...containerProps}
      ref={elementRef}
      className={['liquid-glass-backdrop-converter', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
});
