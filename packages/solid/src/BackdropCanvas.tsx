import type {
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
} from '@agou/liquid-glass-core';
import {
  createEffect,
  onCleanup,
  splitProps,
  untrack,
} from 'solid-js';

import { useLiquidGlassContext } from './LiquidGlassContext';
import type { BackdropCanvasProps } from './types';

/** Solid custom-canvas backdrop registered with the nearest container. */
export function BackdropCanvas(props: BackdropCanvasProps): import('solid-js').JSX.Element {
  const [local, canvasProps] = splitProps(props, ['class', 'draw', 'zIndex']);
  const { context } = useLiquidGlassContext();
  let canvas: HTMLCanvasElement | undefined;
  let handle: BackdropSourceHandle<CanvasBackdropSourceConfig> | null = null;
  let lastDraw = untrack(() => local.draw);
  let lastZIndex = untrack(() => local.zIndex);

  createEffect(() => {
    const currentContext = context();
    if (!currentContext || !canvas) {
      return;
    }

    const registration = currentContext.addBackdropSource({
      kind: 'canvas',
      element: canvas,
      draw: untrack(() => local.draw),
      zIndex: untrack(() => local.zIndex),
      watchPositionChanges: true,
      watchResize: true,
    });
    handle = registration;
    onCleanup(() => {
      registration.destroy();
      if (handle === registration) {
        handle = null;
      }
    });
  });

  createEffect(() => {
    const draw = local.draw;
    const zIndex = local.zIndex;
    if (lastDraw === draw && lastZIndex === zIndex) {
      return;
    }
    lastDraw = draw;
    lastZIndex = zIndex;
    handle?.update({ draw, zIndex });
  });

  return (
    <canvas
      {...canvasProps}
      ref={canvas}
      aria-hidden="true"
      class={['liquid-glass-backdrop-canvas', local.class].filter(Boolean).join(' ')}
    />
  );
}
