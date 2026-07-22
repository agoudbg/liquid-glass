import {
  intersectRects,
  shouldRecaptureViewport,
} from '../backdrop/viewport';
import type { RectLike } from '../types/common';
import type {
  DomBackdropSourceConfig,
  ViewportCaptureConfig,
} from '../types/context';
import type { DomBackdropRegistration } from './registrations';
import type { GlassEngineRuntime } from './runtime';

const CLIPPING_OVERFLOW = /^(auto|clip|hidden|overlay|scroll)$/u;

/** One ancestor that clips a source along either overflow axis. */
export interface ClippingAncestor {
  /** Whether the ancestor clips horizontal pixels. */
  clipX: boolean;
  /** Whether the ancestor clips vertical pixels. */
  clipY: boolean;
  /** Clipping DOM element. */
  element: HTMLElement;
}

/** Find source ancestors whose computed overflow clips rendered pixels. */
export function findClippingAncestors(
  element: HTMLElement,
  runtime: GlassEngineRuntime,
): ClippingAncestor[] {
  const ancestors: ClippingAncestor[] = [];
  let ancestor = element.parentElement;
  while (ancestor) {
    const style = runtime.getComputedStyle(ancestor);
    const shorthand = style.overflow;
    const clipX = CLIPPING_OVERFLOW.test(style.overflowX || shorthand);
    const clipY = CLIPPING_OVERFLOW.test(style.overflowY || shorthand);
    if (clipX || clipY) {
      ancestors.push({ clipX, clipY, element: ancestor });
    }
    ancestor = ancestor.parentElement;
  }
  return ancestors;
}

/** Resolve the capture viewport and intersect every axis-specific clipping ancestor. */
export function resolveCaptureViewport(
  containerRect: DOMRectReadOnly,
  sourceElement: HTMLElement,
  scrollable: boolean,
  runtime: GlassEngineRuntime,
): RectLike {
  let viewport: RectLike;
  if (scrollable) {
    viewport = containerRect;
  } else if (runtime.getViewportRect) {
    viewport = runtime.getViewportRect();
  } else {
    const width = typeof globalThis.innerWidth === 'number'
      ? globalThis.innerWidth
      : containerRect.width;
    const height = typeof globalThis.innerHeight === 'number'
      ? globalThis.innerHeight
      : containerRect.height;
    viewport = { x: 0, y: 0, width, height };
  }

  for (const ancestor of findClippingAncestors(sourceElement, runtime)) {
    viewport = intersectRects(
      viewport,
      ancestor.element.getBoundingClientRect(),
      ancestor.clipX,
      ancestor.clipY,
    );
  }
  return viewport;
}

/** Apply the context viewport override without discarding source buffer options. */
export function resolveViewportPolicy(
  config: DomBackdropSourceConfig,
  viewportMode: boolean,
): boolean | ViewportCaptureConfig {
  if (!viewportMode) {
    return config.viewportCapture ?? false;
  }
  if (typeof config.viewportCapture === 'object') {
    return { ...config.viewportCapture, enabled: true };
  }
  return true;
}

/** Decide whether a moved or scrolled source has exhausted its cached bitmap. */
export function needsViewportRecapture(
  source: DomBackdropRegistration,
  containerRect: DOMRectReadOnly,
  viewportMode: boolean,
  scrollable: boolean,
  runtime: GlassEngineRuntime,
): boolean {
  const policy = resolveViewportPolicy(source.config, viewportMode);
  const enabled = typeof policy === 'boolean'
    ? policy
    : policy.enabled ?? true;
  if (!enabled) {
    return false;
  }
  const sourceRect = source.config.element.getBoundingClientRect();
  return shouldRecaptureViewport(
    sourceRect,
    {
      width: Math.max(source.config.element.scrollWidth, sourceRect.width),
      height: Math.max(source.config.element.scrollHeight, sourceRect.height),
    },
    resolveCaptureViewport(
      containerRect,
      source.config.element,
      scrollable,
      runtime,
    ),
    policy,
    source.viewportRect,
  );
}
