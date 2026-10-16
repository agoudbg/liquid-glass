import type {
  MaterialChanges,
  MaterialConfig,
  MaterialDomAppearance,
  MaterialHandle,
  MaterialPointerPolicy,
} from '@agou/liquid-glass-core';
import {
  bindMaterialPointerEvents,
  MaterialDomPresentationController,
  MaterialPointerController,
} from '@agou/liquid-glass-core';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useLiquidGlassContext } from './LiquidGlassContext';
import type {
  GlassStyle,
  LiquidGlassMaterialHandle,
  LiquidGlassMaterialProps,
  MaterialRenderControls,
} from './types';

function runMaterialCleanupTasks(tasks: readonly (() => void)[]): void {
  let failed = false;
  let firstFailure: unknown;
  for (const task of tasks) {
    try {
      task();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstFailure = error;
      }
    }
  }
  if (failed) throw firstFailure;
}

function rollbackMaterialSetup(
  failure: unknown,
  tasks: readonly (() => void)[],
): never {
  try {
    runMaterialCleanupTasks(tasks);
  } catch {
    // The setup failure remains authoritative after every acquired resource is released.
  }
  throw failure;
}

/** React material registered with the nearest `LiquidGlass` container. */
export const LiquidGlassMaterial = forwardRef<
  LiquidGlassMaterialHandle,
  LiquidGlassMaterialProps
>(function LiquidGlassMaterial(
  {
    backgroundColor,
    blur,
    children,
    className,
    disableInteractions,
    dispersion = 0.01,
    edgeStyle,
    illuminationAngle = 45,
    illuminationIntensity = 0.5,
    interactionConfig,
    interactionPreset,
    isMoveable,
    onlyClickInteractions,
    proxyTarget,
    radius = 24,
    radiusBL,
    radiusBR,
    radiusTL,
    radiusTR,
    refractIndex = 1.1,
    refractIntensity = 0.5,
    renderMode,
    renderOrder,
    style,
    thickness = 10,
    useCustomColor,
    ...elementProps
  },
  forwardedRef,
) {
  const { context } = useLiquidGlassContext();
  const materialRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MaterialHandle | null>(null);
  const pointerControllerRef = useRef<MaterialPointerController | null>(null);
  const presentationControllerRef = useRef<MaterialDomPresentationController | null>(null);
  const [updating, setUpdating] = useState(false);
  const updatingRef = useRef(false);

  const changes = useMemo<MaterialChanges>(() => ({
    radius,
    radiusTR,
    radiusBR,
    radiusBL,
    radiusTL,
    thickness,
    refractIndex,
    refractIntensity,
    blur,
    dispersion,
    disableInteractions,
    onlyClickInteractions,
    isMoveable,
    interactionPreset,
    interactionConfig,
    renderMode,
    renderOrder,
    proxyTarget,
  }), [
    blur,
    disableInteractions,
    dispersion,
    interactionConfig,
    interactionPreset,
    isMoveable,
    onlyClickInteractions,
    proxyTarget,
    radius,
    radiusBL,
    radiusBR,
    radiusTL,
    radiusTR,
    refractIndex,
    refractIntensity,
    renderMode,
    renderOrder,
    thickness,
  ]);
  const changesRef = useRef(changes);
  changesRef.current = changes;

  const appearance = useMemo<MaterialDomAppearance>(() => ({
    backgroundColor,
    edgeStyle,
    illuminationAngle,
    illuminationIntensity,
    thickness,
    useCustomColor,
  }), [
    backgroundColor,
    edgeStyle,
    illuminationAngle,
    illuminationIntensity,
    thickness,
    useCustomColor,
  ]);
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;

  const pointerPolicy = useMemo<MaterialPointerPolicy>(() => ({
    disableInteractions,
    onlyClickInteractions,
  }), [disableInteractions, onlyClickInteractions]);
  const pointerPolicyRef = useRef(pointerPolicy);
  pointerPolicyRef.current = pointerPolicy;

  // React treats `only-*` as an event prop, so preserve the legacy attribute through the ref.
  const setMaterialElement = useCallback((element: HTMLDivElement | null) => {
    materialRef.current = element;
    element?.setAttribute(
      'only-click-interactions',
      String(onlyClickInteractions === true),
    );
  }, [onlyClickInteractions]);

  useEffect(() => {
    const element = materialRef.current;
    const highlight = highlightRef.current;
    if (!context || !element || !highlight) {
      return undefined;
    }

    const config: MaterialConfig = { element, ...changesRef.current };
    const registration = context.addMaterial(config);
    const cleanupTasks: Array<() => void> = [() => registration.destroy()];
    try {
      const pointerController = new MaterialPointerController(
        element,
        registration,
        pointerPolicyRef.current,
      );
      cleanupTasks.unshift(() => pointerController.destroy());
      const unbindPointerEvents = bindMaterialPointerEvents(element, pointerController);
      cleanupTasks.unshift(unbindPointerEvents);
      const presentationController = new MaterialDomPresentationController(
        element,
        highlight,
        registration,
        appearanceRef.current,
      );
      cleanupTasks.unshift(() => presentationController.destroy());
      if (updatingRef.current) registration.startLayoutUpdates();
      handleRef.current = registration;
      pointerControllerRef.current = pointerController;
      presentationControllerRef.current = presentationController;
      return () => {
        try {
          runMaterialCleanupTasks(cleanupTasks);
        } finally {
          if (handleRef.current === registration) {
            handleRef.current = null;
          }
          if (pointerControllerRef.current === pointerController) {
            pointerControllerRef.current = null;
          }
          if (presentationControllerRef.current === presentationController) {
            presentationControllerRef.current = null;
          }
        }
      };
    } catch (error) {
      return rollbackMaterialSetup(error, cleanupTasks);
    }
  }, [context]);

  useEffect(() => {
    handleRef.current?.update(changes);
  }, [changes]);

  useEffect(() => {
    presentationControllerRef.current?.updateAppearance(appearance);
  }, [appearance]);

  useEffect(() => {
    pointerControllerRef.current?.updatePolicy(pointerPolicy);
  }, [pointerPolicy]);

  useImperativeHandle(forwardedRef, () => ({
    getHandle: () => handleRef.current,
    refreshLayout: () => handleRef.current?.refreshLayout(),
  }), []);

  const radiusValues = [radiusTL ?? radius, radiusTR ?? radius, radiusBR ?? radius, radiusBL ?? radius];
  const materialStyle: GlassStyle = {
    '--lg-border-radius': radiusValues.map((value) => `${value}px`).join(' '),
    '--lg-fallback-blur': `${Math.min(blur ?? 6, 6)}px`,
    ...style,
  };

  const controls: MaterialRenderControls = {
    updating,
    startUpdating: () => {
      const handle = handleRef.current;
      if (!handle || updatingRef.current) return;
      handle.startLayoutUpdates();
      updatingRef.current = true;
      setUpdating(true);
    },
    stopUpdating: () => {
      const handle = handleRef.current;
      if (!handle || !updatingRef.current) return;
      handle.stopLayoutUpdates();
      updatingRef.current = false;
      setUpdating(false);
    },
  };

  return (
    <div
      {...elementProps}
      ref={setMaterialElement}
      className={['liquid-glass-material', className].filter(Boolean).join(' ')}
      disable-interactions={String(disableInteractions === true)}
      render-mode={renderMode}
      style={materialStyle}
    >
      <div className="liquid-glass-background" aria-hidden="true" />
      <div ref={highlightRef} className="liquid-glass-highlight" aria-hidden="true" />
      {typeof children === 'function' ? children(controls) : children}
    </div>
  );
});
