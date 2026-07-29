// eslint-disable-next-line simple-import-sort/imports -- Workbench CSS must load after eager adapter styles.
import { bootstrapPlaygroundShell } from './shell/controller';

import './styles.css';
import './styles/diagnostics.css';
import './styles/scroll-scenes.css';
import './styles/interaction-scenes.css';
import './styles/interaction-policy-fixture.css';
import './styles/composition-scenes.css';
import './styles/scene-controls.css';
import './styles/workbench-tabs.css';
import './styles/lab-controls.css';
import './styles/responsive.css';

import { PLAYGROUND_MARKUP } from './shell/markup';

const mountPoint = document.getElementById('app');

if (!mountPoint) {
  throw new Error('Could not find #app mount point.');
}

mountPoint.innerHTML = PLAYGROUND_MARKUP;
const controller = bootstrapPlaygroundShell(mountPoint);
if (controller.state.testMode) {
  window.addEventListener(
    'liquid-glass-playground-test-teardown',
    () => controller.destroy(),
    { once: true },
  );
}
