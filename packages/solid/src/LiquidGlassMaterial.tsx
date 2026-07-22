import type {
  MaterialChanges,
  MaterialConfig,
  MaterialHandle,
} from '@agou/liquid-glass-core';
import {
  createEffect,
  createSignal,
  mergeProps,
  onCleanup,
  splitProps,
  untrack,
} from 'solid-js';

import { useLiquidGlassContext } from './LiquidGlassContext';
import type {
  GlassStyle,
  LiquidGlassMaterialHandle,
  LiquidGlassMaterialProps,
  MaterialRenderControls,
} from './types';

/** Solid material registered with the nearest `LiquidGlass` container. */
export function LiquidGlassMaterial(
  sourceProps: LiquidGlassMaterialProps,
): import('solid-js').JSX.Element {
  const props = mergeProps({
    blur: 0,
    dispersion: 0.01,
    illuminationAngle: 45,
    illuminationIntensity: 0.5,
    radius: 24,
    refractIndex: 1.1,
    refractIntensity: 0.5,
    thickness: 10,
  }, sourceProps);
  const [local, elementProps] = splitProps(props, [
    'apiRef',
    'backgroundColor',
    'blur',
    'children',
    'class',
    'disableInteractions',
    'dispersion',
    'illuminationAngle',
    'illuminationIntensity',
    'interactionConfig',
    'interactionPreset',
    'onlyClickInteractions',
    'proxyTarget',
    'radius',
    'radiusBL',
    'radiusBR',
    'radiusTL',
    'radiusTR',
    'refractIndex',
    'refractIntensity',
    'renderMode',
    'renderOrder',
    'style',
    'thickness',
    'useCustomColor',
  ]);
  const { context } = useLiquidGlassContext();
  const [updating, setUpdating] = createSignal(false);
  let materialElement: HTMLDivElement | undefined;
  let handle: MaterialHandle | null = null;

  function readChanges(): MaterialChanges {
    return {
      radius: local.radius,
      radiusTR: local.radiusTR,
      radiusBR: local.radiusBR,
      radiusBL: local.radiusBL,
      radiusTL: local.radiusTL,
      thickness: local.thickness,
      refractIndex: local.refractIndex,
      refractIntensity: local.refractIntensity,
      blur: local.blur,
      dispersion: local.dispersion,
      disableInteractions: local.disableInteractions,
      onlyClickInteractions: local.onlyClickInteractions,
      interactionPreset: local.interactionPreset,
      interactionConfig: local.interactionConfig,
      renderMode: local.renderMode,
      renderOrder: local.renderOrder,
      proxyTarget: local.proxyTarget,
    };
  }

  createEffect(() => {
    const currentContext = context();
    if (!currentContext || !materialElement) {
      return;
    }

    const config: MaterialConfig = {
      element: materialElement,
      ...untrack(readChanges),
    };
    const registration = currentContext.addMaterial(config);
    handle = registration;
    onCleanup(() => {
      registration.destroy();
      if (handle === registration) {
        handle = null;
      }
    });
  });

  createEffect(() => {
    const changes = readChanges();
    handle?.update(changes);
  });

  const controls: MaterialRenderControls = {
    updating,
    startUpdating: () => {
      setUpdating(true);
      handle?.refreshLayout();
    },
    stopUpdating: () => {
      setUpdating(false);
      handle?.refreshLayout();
    },
  };
  const imperativeHandle: LiquidGlassMaterialHandle = {
    getHandle: () => handle,
    refreshLayout: () => handle?.refreshLayout(),
  };
  createEffect(() => {
    const callback = local.apiRef;
    callback?.(imperativeHandle);
    onCleanup(() => callback?.(null));
  });

  const materialStyle = (): GlassStyle => {
    const radius = local.radius;
    const radii = [
      local.radiusTL ?? radius,
      local.radiusTR ?? radius,
      local.radiusBR ?? radius,
      local.radiusBL ?? radius,
    ];
    return {
      '--lg-background-tint': local.useCustomColor
        ? (local.backgroundColor ?? 'transparent')
        : 'rgba(255, 255, 255, 0.12)',
      '--lg-border-radius': radii.map((value) => `${value}px`).join(' '),
      '--lg-illumination-angle': `${local.illuminationAngle}deg`,
      '--lg-illumination-intensity': local.illuminationIntensity,
      ...local.style,
    };
  };

  return (
    <div
      {...elementProps}
      ref={materialElement}
      class={['liquid-glass-material', local.class].filter(Boolean).join(' ')}
      style={materialStyle()}
    >
      <div class="liquid-glass-background" aria-hidden="true" />
      <div class="liquid-glass-highlight" aria-hidden="true" />
      <div class="liquid-glass-content">
        {typeof local.children === 'function' ? local.children(controls) : local.children}
      </div>
    </div>
  );
}
