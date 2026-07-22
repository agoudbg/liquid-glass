import { GlassError } from '../errors/GlassError';
import type { ProxyInterface } from '../types/external-material';

/** Create the stable delegation surface owned by one glass container. */
export function createContextProxyInterface(
  container: HTMLElement,
  isDestroyed: () => boolean,
): ProxyInterface {
  return {
    registerExternalMaterial: () => {
      throw new GlassError(
        'INVALID_CONFIG',
        'External material delegation is introduced in rewrite phase P6.',
        { phase: 'configuration' },
      );
    },
    getContainerRect: () => (
      isDestroyed() ? null : container.getBoundingClientRect()
    ),
    getScrollPosition: () => ({
      x: container.scrollLeft,
      y: container.scrollTop,
    }),
  };
}
