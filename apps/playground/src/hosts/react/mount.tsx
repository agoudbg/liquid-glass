/** @jsxImportSource react */
import { createRoot } from 'react-dom/client';

import type {
  FrameworkHostCallbacks,
  FrameworkHostController,
  PlaygroundState,
} from '../../shared/types';
import { ReactScene } from './ReactScene';

/** Mount the real React public adapter and preserve its root across updates. */
export function mountReactHost(
  container: HTMLElement,
  state: PlaygroundState,
  callbacks: FrameworkHostCallbacks,
): FrameworkHostController {
  const root = createRoot(container);
  const renderState = (nextState: PlaygroundState): void => {
    root.render(<ReactScene state={nextState} callbacks={callbacks} />);
  };
  renderState(state);

  return {
    update: renderState,
    destroy: () => root.unmount(),
  };
}

export default mountReactHost;
