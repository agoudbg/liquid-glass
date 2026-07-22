import type {
  BackdropSourceChanges,
  BackdropSourceHandle,
  DomBackdropSourceConfig,
} from '@agou/liquid-glass-core';
import {
  createEffect,
  onCleanup,
  splitProps,
  untrack,
} from 'solid-js';

import { useLiquidGlassContext } from './LiquidGlassContext';
import type {
  BackdropConverterHandle,
  BackdropConverterProps,
} from './types';

function equalViewportCapture(
  left: DomBackdropSourceConfig['viewportCapture'],
  right: DomBackdropSourceConfig['viewportCapture'],
): boolean {
  if (typeof left !== 'object' || typeof right !== 'object') {
    return left === right;
  }
  return left.bufferX === right.bufferX
    && left.bufferY === right.bufferY
    && left.enabled === right.enabled;
}

function equalChanges(
  left: BackdropSourceChanges<DomBackdropSourceConfig>,
  right: BackdropSourceChanges<DomBackdropSourceConfig>,
): boolean {
  return left.backgroundColor === right.backgroundColor
    && left.captureLibrary === right.captureLibrary
    && left.scale === right.scale
    && equalViewportCapture(left.viewportCapture, right.viewportCapture)
    && left.watchNodeChanges === right.watchNodeChanges
    && left.watchPositionChanges === right.watchPositionChanges
    && left.watchResize === right.watchResize
    && left.zIndex === right.zIndex;
}

/** Solid DOM subtree registered as a captured backdrop with the nearest container. */
export function BackdropConverter(
  props: BackdropConverterProps,
): import('solid-js').JSX.Element {
  const [local, containerProps] = splitProps(props, [
    'apiRef',
    'backgroundColor',
    'captureLibrary',
    'children',
    'class',
    'scale',
    'viewportCapture',
    'watchNodeChanges',
    'watchPositionChanges',
    'watchResize',
    'zIndex',
  ]);
  const { context } = useLiquidGlassContext();
  let element: HTMLDivElement | undefined;
  let handle: BackdropSourceHandle<DomBackdropSourceConfig> | null = null;

  function readChanges(): BackdropSourceChanges<DomBackdropSourceConfig> {
    const viewportCapture = local.viewportCapture;
    return {
      backgroundColor: local.backgroundColor,
      captureLibrary: local.captureLibrary ?? 'html-to-image',
      scale: local.scale,
      viewportCapture: typeof viewportCapture === 'object'
        ? { ...viewportCapture }
        : viewportCapture,
      watchNodeChanges: local.watchNodeChanges ?? true,
      watchPositionChanges: local.watchPositionChanges ?? true,
      watchResize: local.watchResize ?? true,
      zIndex: local.zIndex,
    };
  }

  let lastChanges = untrack(readChanges);
  const publicHandle: BackdropConverterHandle = {
    getHandle: () => handle,
    refresh: () => handle?.refresh(),
  };

  createEffect(() => {
    const callback = local.apiRef;
    callback?.(publicHandle);
    onCleanup(() => callback?.(null));
  });

  createEffect(() => {
    const currentContext = context();
    if (!currentContext || !element) {
      return;
    }

    const changes = untrack(readChanges);
    const registration = currentContext.addBackdropSource({
      kind: 'dom',
      element,
      ...changes,
    });
    handle = registration;
    lastChanges = changes;
    onCleanup(() => {
      registration.destroy();
      if (handle === registration) {
        handle = null;
      }
    });
  });

  createEffect(() => {
    const changes = readChanges();
    if (equalChanges(lastChanges, changes)) {
      return;
    }
    lastChanges = changes;
    handle?.update(changes);
  });

  return (
    <div
      {...containerProps}
      ref={element}
      class={['liquid-glass-backdrop-converter', local.class].filter(Boolean).join(' ')}
    >
      {local.children}
    </div>
  );
}
