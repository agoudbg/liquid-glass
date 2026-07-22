import { createApp, h, shallowReactive } from 'vue';

import type {
  FrameworkHostCallbacks,
  FrameworkHostController,
  PlaygroundState,
} from '../../shared/types';
import VueScene from './VueScene.vue';

/** Mount the real Vue public adapter and retain a reactive update seam. */
export function mountVueHost(
  container: HTMLElement,
  state: PlaygroundState,
  callbacks: FrameworkHostCallbacks,
): FrameworkHostController {
  const source = shallowReactive({ state });
  const application = createApp({
    name: 'VuePlaygroundHost',
    setup: () => () => h(VueScene, { state: source.state, callbacks }),
  });
  application.mount(container);

  return {
    update: (nextState) => {
      source.state = nextState;
    },
    destroy: () => application.unmount(),
  };
}

export default mountVueHost;
