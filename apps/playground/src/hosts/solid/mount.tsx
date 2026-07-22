/** @jsxImportSource solid-js */
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';

import type {
  FrameworkHostCallbacks,
  FrameworkHostController,
  PlaygroundState,
} from '../../shared/types';
import { SolidScene } from './SolidScene';

/** Mount the real Solid public adapter and preserve its owner across updates. */
export function mountSolidHost(
  container: HTMLElement,
  state: PlaygroundState,
  callbacks: FrameworkHostCallbacks,
): FrameworkHostController {
  const [currentState, setCurrentState] = createSignal(state, { equals: false });
  const dispose = render(
    () => <SolidScene state={currentState()} callbacks={callbacks} />,
    container,
  );

  return {
    update: (nextState) => setCurrentState(nextState),
    destroy: dispose,
  };
}

export default mountSolidHost;
