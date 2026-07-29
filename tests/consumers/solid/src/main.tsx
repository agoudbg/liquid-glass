import '@agou/liquid-glass-solid/style.css';
import './styles.css';

import { render } from 'solid-js/web';

import { App } from './App';

const mountElement = document.getElementById('app');

if (!mountElement) {
  throw new Error('Could not find the Solid mount point.');
}

render(() => <App />, mountElement);
