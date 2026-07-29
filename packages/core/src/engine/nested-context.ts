import { GlassError } from '../errors/GlassError';
import type {
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  CanvasRenderPayload,
  GlassContext,
} from '../types/context';
import {
  rethrowAfterRunningTasks,
  runTasksPreservingFirstFailure,
} from '../utils/run-tasks';

/** Optional presentation controls for one nested-context connection. */
export interface NestedContextOptions {
  /** Stacking order used when the child is composed with sibling backdrops. */
  zIndex?: number;
}

/** Lifecycle handle for a child context sampled by its nearest parent. */
export interface NestedContextHandle {
  /** Whether this bridge has released its source and event subscriptions. */
  readonly destroyed: boolean;
  /** Idempotently stop sampling the child context. */
  destroy(): void;
}

/**
 * Sample a child context's complete viewport output as a parent backdrop.
 *
 * @param parent - Context that owns the resulting backdrop source.
 * @param child - Nested context producing complete viewport frames.
 * @param childContainer - DOM element positioning the child inside the parent.
 * @param options - Optional source presentation controls.
 * @returns A lifecycle handle that releases both contexts' subscriptions.
 */
export function connectNestedGlassContexts(
  parent: GlassContext,
  child: GlassContext,
  childContainer: HTMLElement,
  options: NestedContextOptions = {},
): NestedContextHandle {
  if (parent === child) {
    throw new GlassError(
      'INVALID_CONFIG',
      'A glass context cannot use itself as a nested backdrop.',
      { phase: 'configuration' },
    );
  }
  if (parent.destroyed || child.destroyed) {
    throw new GlassError(
      'DESTROYED_CONTEXT',
      'Nested glass contexts must both be active.',
      { phase: 'lifecycle' },
    );
  }

  let latestFrame: CanvasRenderPayload | null = null;
  let source: BackdropSourceHandle<CanvasBackdropSourceConfig> | null = null;
  let unsubscribeFrame: (() => void) | null = null;
  let unsubscribeParentDestroyed: (() => void) | null = null;
  let unsubscribeChildDestroyed: (() => void) | null = null;
  let destroyed = false;

  const handle: NestedContextHandle = {
    get destroyed() {
      return destroyed;
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      const sourceToDestroy = source;
      const cleanupTasks = [
        unsubscribeFrame,
        unsubscribeParentDestroyed,
        unsubscribeChildDestroyed,
        sourceToDestroy ? () => sourceToDestroy.destroy() : null,
      ].filter((task): task is () => void => task !== null);
      unsubscribeFrame = null;
      unsubscribeParentDestroyed = null;
      unsubscribeChildDestroyed = null;
      source = null;
      runTasksPreservingFirstFailure(cleanupTasks);
    },
  };

  try {
    unsubscribeFrame = child.on('fullCanvasRendered', (payload) => {
      latestFrame = payload;
      source?.refresh();
    });
    unsubscribeParentDestroyed = parent.on('destroyed', handle.destroy);
    unsubscribeChildDestroyed = child.on('destroyed', handle.destroy);
    source = parent.addBackdropSource({
      boundsElement: childContainer,
      draw: (context, width, height) => {
        if (!latestFrame) return;
        context.drawImage(
          latestFrame.canvas,
          0,
          0,
          latestFrame.width,
          latestFrame.height,
          0,
          0,
          width,
          height,
        );
      },
      element: child.canvas,
      kind: 'canvas',
      mirrorToElement: false,
      watchPositionChanges: true,
      watchResize: true,
      zIndex: options.zIndex,
    });
    child.refresh('structural');
    return handle;
  } catch (error) {
    rethrowAfterRunningTasks(error, [handle.destroy]);
  }
}
