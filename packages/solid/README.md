# @agou/liquid-glass-solid

Solid adapter for `@agou/liquid-glass-core`.

```bash
pnpm add @agou/liquid-glass-solid @agou/liquid-glass-core
```

```ts
import '@agou/liquid-glass-solid/style.css';
```

```tsx
import type { CustomDrawCallback } from '@agou/liquid-glass-core';
import {
  BackdropCanvas,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-solid';
import type { Component } from 'solid-js';

const drawBackdrop: CustomDrawCallback = (context, width, height) => {
  context.fillStyle = '#dce4df';
  context.fillRect(0, 0, width, height);
};

export const GlassExample: Component = () => (
  <LiquidGlass class="glass-stage" options={{ renderPrecision: 1 }}>
    <BackdropCanvas draw={drawBackdrop} />
    <LiquidGlassMaterial
      class="glass-material"
      radius={32}
      thickness={42}
      refractIntensity={0.76}
    >
      Solid liquid glass
    </LiquidGlassMaterial>
  </LiquidGlass>
);
```

The package also exports `BackdropConverter`, `LiquidGlassContext`, and
`useLiquidGlassContext`. Use `apiRef` callbacks for typed imperative handles.

The package publishes a dedicated `node` conditional entry for SSR imports.
Mount components only in client code.

MIT licensed.
