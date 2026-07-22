import type {
  MaterialChanges,
  MaterialConfig,
  MaterialHandle,
} from '@agou/liquid-glass-core';
import {
  forwardRef,
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

/** React material registered with the nearest `LiquidGlass` container. */
export const LiquidGlassMaterial = forwardRef<
  LiquidGlassMaterialHandle,
  LiquidGlassMaterialProps
>(function LiquidGlassMaterial(
  {
    backgroundColor,
    blur = 0,
    children,
    className,
    disableInteractions,
    dispersion = 0.01,
    illuminationAngle = 45,
    illuminationIntensity = 0.5,
    interactionConfig,
    interactionPreset,
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
  const handleRef = useRef<MaterialHandle | null>(null);
  const [updating, setUpdating] = useState(false);

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

  useEffect(() => {
    changesRef.current = changes;
  }, [changes]);

  useEffect(() => {
    const element = materialRef.current;
    if (!context || !element) {
      return undefined;
    }

    const config: MaterialConfig = { element, ...changesRef.current };
    const registration = context.addMaterial(config);
    handleRef.current = registration;
    return () => {
      registration.destroy();
      if (handleRef.current === registration) {
        handleRef.current = null;
      }
    };
  }, [context]);

  useEffect(() => {
    handleRef.current?.update(changes);
  }, [changes]);

  useImperativeHandle(forwardedRef, () => ({
    getHandle: () => handleRef.current,
    refreshLayout: () => handleRef.current?.refreshLayout(),
  }), []);

  const radiusValues = [radiusTL ?? radius, radiusTR ?? radius, radiusBR ?? radius, radiusBL ?? radius];
  const materialStyle: GlassStyle = {
    '--lg-background-tint': useCustomColor
      ? (backgroundColor ?? 'transparent')
      : 'rgba(255, 255, 255, 0.12)',
    '--lg-border-radius': radiusValues.map((value) => `${value}px`).join(' '),
    '--lg-illumination-angle': `${illuminationAngle}deg`,
    '--lg-illumination-intensity': illuminationIntensity,
    ...style,
  };

  const controls: MaterialRenderControls = {
    updating,
    startUpdating: () => {
      setUpdating(true);
      handleRef.current?.refreshLayout();
    },
    stopUpdating: () => {
      setUpdating(false);
      handleRef.current?.refreshLayout();
    },
  };

  return (
    <div
      {...elementProps}
      ref={materialRef}
      className={['liquid-glass-material', className].filter(Boolean).join(' ')}
      style={materialStyle}
    >
      <div className="liquid-glass-background" aria-hidden="true" />
      <div className="liquid-glass-highlight" aria-hidden="true" />
      <div className="liquid-glass-content">
        {typeof children === 'function' ? children(controls) : children}
      </div>
    </div>
  );
});
