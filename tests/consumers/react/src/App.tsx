import {
  CORE_VERSION,
  LiquidGlass,
  LiquidGlassMaterial,
  REACT_ADAPTER_VERSION,
} from '@agou/liquid-glass-react';
import type { JSX } from 'react';

export function App(): JSX.Element {
  return (
    <LiquidGlass>
      <LiquidGlassMaterial radius={18}>
        <main>
          <h1>React adapter package loaded</h1>
          <output>
            adapter {REACT_ADAPTER_VERSION}, core {CORE_VERSION}
          </output>
        </main>
      </LiquidGlassMaterial>
    </LiquidGlass>
  );
}
