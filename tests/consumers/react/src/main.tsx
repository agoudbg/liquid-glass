import '@agou/liquid-glass-react/style.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

const mountElement = document.getElementById('app');

if (!mountElement) {
  throw new Error('Could not find the React mount point.');
}

createRoot(mountElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
