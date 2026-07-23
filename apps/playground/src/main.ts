// eslint-disable-next-line simple-import-sort/imports -- Workbench CSS must load after eager adapter styles.
import { bootstrapPlaygroundShell } from './shell/controller';

import './styles.css';
import './styles/diagnostics.css';
import './styles/scroll-scenes.css';
import './styles/scene-controls.css';
import './styles/responsive.css';

import { PLAYGROUND_MARKUP } from './shell/markup';

const mountPoint = document.getElementById('app');

if (!mountPoint) {
  throw new Error('Could not find #app mount point.');
}

mountPoint.innerHTML = PLAYGROUND_MARKUP;
bootstrapPlaygroundShell(mountPoint);
