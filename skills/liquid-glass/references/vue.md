# Vue 3.5+

Install the Vue adapter with the application's package manager. For pnpm:

```sh
pnpm add @agou/liquid-glass-vue
```

Import `@agou/liquid-glass-vue/style.css` once in the client entry point, then
the application-owned `glass.css` from [shared layout](shared.md).

## DOM backdrop example

```vue
<script setup lang="ts">
import {
  LgBackdropConverter,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-vue';
</script>

<template>
  <LiquidGlass
    class="glass-stage"
    :options="{ enableFallback: true, renderPrecision: 1 }"
  >
    <LgBackdropConverter class="glass-backdrop">
      <h2>Background content</h2>
      <p>These stripes and this text are captured behind the glass.</p>
    </LgBackdropConverter>
    <LiquidGlassMaterial
      class="glass-panel"
      :radius="28"
      :thickness="36"
      :refract-intensity="0.7"
      :disable-interactions="true"
    >
      <h3>Glass panel</h3>
      <button type="button">Native control</button>
    </LiquidGlassMaterial>
  </LiquidGlass>
</template>
```

The Vue canvas component is `LgBackdropCanvas`, not `BackdropCanvas`. Use
`:draw="drawBackdrop"` for its `CustomDrawCallback`.

## Props, events, and imperative controls

- Bind numeric values with `:` and use kebab-case prop names in templates.
- `options` accepts `GlassContextOptions`. The legacy top-level `renderMode`,
  `renderPrecision`, `scrollable`, `debug`, and related context props override
  matching options. Prefer one configuration location for each setting.
- The container emits `ready` with its core context and `error` for context
  creation or nested-connection failures. Subscribe to the context's `error`
  event for later capture or rendering failures.
- `useLiquidGlassContext()` returns `{ context }`, where `context` is a
  `ShallowRef<GlassContext | null>`. Call it in a descendant's setup and read
  `context.value` after mount. A component that renders `LiquidGlass` cannot
  inject that child's context from its own setup.
- Use typed template refs with `LiquidGlassExposed`,
  `LiquidGlassMaterialExposed`, and `LgBackdropConverterExposed` from the Vue
  adapter. The container exposes `getContext()`, `refresh()`,
  `refreshVisibility()`, and `getProxyTarget()`.
- A material exposes `getHandle()` and `refreshLayout()`. Its default slot
  receives `updating`, `startUpdating()`, and `stopUpdating()`. It emits
  `backgroundColorChange` when sampled theme feedback changes.
- A converter exposes `getHandle()` and `refresh()`. Its default slot receives
  `refresh()` and the legacy alias `requestBackdropRedraw()`. The `captureLib`
  prop is a legacy alias; use `captureLibrary` in new integrations.
- After changing reactive DOM content, wait for `nextTick()` before an explicit
  converter `refresh()` so capture sees the updated DOM.

In SSR hosts, mount this component with the application's client-only mechanism.
Let adapter unmount hooks release the context and registrations.
