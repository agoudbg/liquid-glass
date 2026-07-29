# @agou/liquid-glass-react

React 19 adapter for `@agou/liquid-glass-core`.

```bash
pnpm add @agou/liquid-glass-react @agou/liquid-glass-core
```

```ts
import '@agou/liquid-glass-react/style.css';
```

```tsx
import type { CustomDrawCallback } from '@agou/liquid-glass-core';
import {
  BackdropCanvas,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-react';
import type { JSX } from 'react';

const drawBackdrop: CustomDrawCallback = (context, width, height) => {
  context.fillStyle = '#dce4df';
  context.fillRect(0, 0, width, height);
};

export function GlassExample(): JSX.Element {
  return (
    <LiquidGlass className="glass-stage" options={{ renderPrecision: 1 }}>
      <BackdropCanvas draw={drawBackdrop} />
      <LiquidGlassMaterial
        className="glass-material"
        radius={32}
        thickness={42}
        refractIntensity={0.76}
      >
        React liquid glass
      </LiquidGlassMaterial>
    </LiquidGlass>
  );
}
```

The package also exports `BackdropConverter`, `LiquidGlassContext`, and
`useLiquidGlassContext`. Use refs for the typed imperative handles.

The container and material require application-owned dimensions. Imports are
SSR-safe; mount components only in client code.

MIT licensed.
