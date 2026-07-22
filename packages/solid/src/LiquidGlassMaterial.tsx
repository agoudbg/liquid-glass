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
  let highlightElement: HTMLDivElement | undefined;
  let handle: MaterialHandle | null = null;
  let pointerController: MaterialPointerController | null = null;
  let presentationController: MaterialDomPresentationController | null = null;

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

  function readAppearance(): MaterialDomAppearance {
    return {
      backgroundColor: local.backgroundColor,
      illuminationAngle: local.illuminationAngle,
      illuminationIntensity: local.illuminationIntensity,
      thickness: local.thickness,
      useCustomColor: local.useCustomColor,
    };
  }

  function readInteractionPolicy(): MaterialPointerPolicy {
    return {
      disableInteractions: local.disableInteractions,
      onlyClickInteractions: local.onlyClickInteractions,
    };
  }

  createEffect(() => {
    const currentContext = context();
    if (!currentContext || !materialElement || !highlightElement) {
      return;
    }

    const config: MaterialConfig = {
      element: materialElement,
      ...untrack(readChanges),
    };
    const registration = currentContext.addMaterial(config);
    const pointer = new MaterialPointerController(
      materialElement,
      registration,
      untrack(readInteractionPolicy),
    );
    const unbindPointerEvents = bindMaterialPointerEvents(materialElement, pointer);
    const presentation = new MaterialDomPresentationController(
      materialElement,
      highlightElement,
      registration,
      untrack(readAppearance),
    );
    handle = registration;
    pointerController = pointer;
    presentationController = presentation;
    onCleanup(() => {
      presentation.destroy();
      unbindPointerEvents();
      pointer.destroy();
      registration.destroy();
      if (handle === registration) {
        handle = null;
      }
      if (pointerController === pointer) {
        pointerController = null;
      }
      if (presentationController === presentation) {
        presentationController = null;
      }
    });
  });

  createEffect(() => {
    const changes = readChanges();
    handle?.update(changes);
  });

  createEffect(() => {
    const policy = readInteractionPolicy();
    pointerController?.updatePolicy(policy);
  });

  createEffect(() => {
    const appearance = readAppearance();
    presentationController?.updateAppearance(appearance);
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
      '--lg-border-radius': radii.map((value) => `${value}px`).join(' '),
      '--lg-fallback-blur': `${Math.min(local.blur ?? 6, 6)}px`,
      ...local.style,
    };
  };

  return (
    <div
      {...elementProps}
      ref={materialElement}
      class={['liquid-glass-material', local.class].filter(Boolean).join(' ')}
      attr:disable-interactions={String(local.disableInteractions === true)}
      attr:only-click-interactions={String(local.onlyClickInteractions === true)}
      attr:render-mode={local.renderMode}
      style={materialStyle()}
    >
      <div class="liquid-glass-background" aria-hidden="true" />
      <div
        ref={highlightElement}
        class="liquid-glass-highlight"
        aria-hidden="true"
      />
      <div class="liquid-glass-content">
        {typeof local.children === 'function' ? local.children(controls) : local.children}
      </div>
    </div>
  );
}
