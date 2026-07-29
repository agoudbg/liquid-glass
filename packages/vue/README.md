# @agou/liquid-glass-vue

Vue 3 adapter for `@agou/liquid-glass-core`.

```bash
pnpm add @agou/liquid-glass-vue @agou/liquid-glass-core
```

```ts
import '@agou/liquid-glass-vue/style.css';
```

```vue
<script setup lang="ts">
import type { CustomDrawCallback } from '@agou/liquid-glass-core';
import {
  LgBackdropCanvas,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-vue';

const drawBackdrop: CustomDrawCallback = (context, width, height) => {
  context.fillStyle = '#dce4df';
  context.fillRect(0, 0, width, height);
};
</script>

<template>
  <LiquidGlass class="glass-stage" :render-precision="1">
    <LgBackdropCanvas :draw="drawBackdrop" />
    <LiquidGlassMaterial
      class="glass-material"
      :radius="32"
      :thickness="42"
      :refract-intensity="0.76"
    >
      Vue liquid glass
    </LiquidGlassMaterial>
  </LiquidGlass>
</template>
```

The package also exports `LgBackdropConverter` and
`useLiquidGlassContext`. `LiquidGlassMaterial` emits
`backgroundColorChange` when the sampled theme changes.

The container and material require application-owned dimensions. Imports are
SSR-safe; mount components only in client code.

MIT licensed.
