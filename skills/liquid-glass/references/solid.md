# Solid 1.9+

Install the Solid adapter with the application's package manager. For pnpm:

```sh
pnpm add @agou/liquid-glass-solid
```

Import `@agou/liquid-glass-solid/style.css` once through the application's
stylesheet entry, followed by `glass.css` from [shared layout](shared.md).

## DOM backdrop example

```tsx
import {
  BackdropConverter,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-solid';
import type { Component } from 'solid-js';

/** Render a DOM backdrop with one glass overlay. */
export const GlassExample: Component = () => (
  <LiquidGlass
    class="glass-stage"
    options={{ enableFallback: true, renderPrecision: 1 }}
  >
    <BackdropConverter class="glass-backdrop">
      <h2>Background content</h2>
      <p>These stripes and this text are captured behind the glass.</p>
    </BackdropConverter>
    <LiquidGlassMaterial
      class="glass-panel"
      radius={28}
      thickness={36}
      refractIntensity={0.7}
      disableInteractions
    >
      <h3>Glass panel</h3>
      <button type="button">Native control</button>
    </LiquidGlassMaterial>
  </LiquidGlass>
);
```

For custom drawing, replace the converter with `BackdropCanvas` and pass
`draw={drawBackdrop}`. Use Solid's `class` and reactive prop access. Put context
settings inside `options`, not on Vue-style top-level props.

## Handles, context, and lifecycle

- Use `apiRef={(handle) => { containerHandle = handle; }}` for imperative APIs.
  Type the application variable as `LiquidGlassHandle | null`. The adapter also
  exports `LiquidGlassMaterialHandle` and `BackdropConverterHandle`.
  `apiRef` receives `null` during cleanup; it is not a native DOM ref callback.
- The container handle provides `getContext()`, `refresh()`,
  `refreshVisibility()`, and `getProxyTarget()`. The material handle provides
  `getHandle()` and `refreshLayout()`; the converter handle provides
  `getHandle()` and `refresh()`.
- `useLiquidGlassContext()` returns `{ context }`, where `context` is an
  `Accessor<GlassContext | null>`. Call `context()` inside a descendant to read
  the current instance. The hook must run under an ancestor `LiquidGlass`, not
  in the component that creates that provider.
- `onReady(context)` reports successful creation; `onError(error)` reports
  creation or nested-connection failures. Subscribe to context `error` events
  for ongoing failures, and dispose application subscriptions with their
  returned unsubscribe function when their context changes or the owner is
  cleaned up.
- A material function child receives `updating` as an accessor, plus
  `startUpdating()` and `stopUpdating()`. Read `updating()` in reactive code.
- Pass changing props through reactive expressions instead of taking a
  nonreactive snapshot. Let the adapter own registrations and cleanup.

The package has a dedicated `node` conditional entry for safe SSR imports.
Use the SSR host's client-only mounting mechanism for the glass subtree.
