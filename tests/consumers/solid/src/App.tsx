import {
  CORE_VERSION,
  LiquidGlass,
  LiquidGlassMaterial,
  SOLID_ADAPTER_VERSION,
} from '@agou/liquid-glass-solid';
import type { Component } from 'solid-js';

export const App: Component = () => (
  <LiquidGlass>
    <LiquidGlassMaterial radius={18}>
      <main>
        <h1>Solid adapter package loaded</h1>
        <output>
          adapter {SOLID_ADAPTER_VERSION}, core {CORE_VERSION}
        </output>
      </main>
    </LiquidGlassMaterial>
  </LiquidGlass>
);
