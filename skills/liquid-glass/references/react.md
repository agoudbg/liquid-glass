# React 19+

Install the React adapter with the application's package manager. For pnpm:

```sh
pnpm add @agou/liquid-glass-react
```

Import `@agou/liquid-glass-react/style.css` once through the application's
stylesheet entry, followed by `glass.css` from [shared layout](shared.md).

## DOM backdrop example

```tsx
import {
  BackdropConverter,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-react';
import type { JSX } from 'react';

/** Render a DOM backdrop with one glass overlay. */
export function GlassExample(): JSX.Element {
  return (
    <LiquidGlass
      className="glass-stage"
      options={{ enableFallback: true, renderPrecision: 1 }}
    >
      <BackdropConverter className="glass-backdrop">
        <h2>Background content</h2>
        <p>These stripes and this text are captured behind the glass.</p>
      </BackdropConverter>
      <LiquidGlassMaterial
        className="glass-panel"
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
}
```

For custom drawing, replace the converter with `BackdropCanvas` and pass
`draw={drawBackdrop}`. Put context settings in `options`; top-level Vue props
such as `renderPrecision` are not React container props.

## Refs, context, and lifecycle

- Use `ref` with `useRef<LiquidGlassHandle | null>(null)` for the container.
  `LiquidGlassHandle`, `LiquidGlassMaterialHandle`, and `BackdropConverterHandle`
  are exported by the React adapter. `apiRef` is the Solid API.
- The container handle provides `getContext()`, `refresh()`,
  `refreshVisibility()`, and `getProxyTarget()`. The material handle provides
  `getHandle()` and `refreshLayout()`; the converter handle provides
  `getHandle()` and `refresh()`.
- `useLiquidGlassContext()` returns `{ context }`, where `context` is the
  mounted `GlassContext | null`. Call it from a descendant of `LiquidGlass`.
  A component that returns its own provider cannot read that provider's context
  through a hook in the same component.
- `onReady(context)` runs after context creation. `onError(error)` reports
  context creation or nested-connection failures. For ongoing failures, attach
  a context `error` subscription and return its unsubscribe function from the
  owning effect.
- For geometry transitions, a function child of `LiquidGlassMaterial` receives
  `updating` as a boolean, `startUpdating()`, and `stopUpdating()`.
- Keep canvas callbacks stable until their drawing inputs change, then update
  their `useCallback` dependencies to invalidate the captured pixels. Let component
  effects own engine setup and cleanup, including React Strict Mode remounts.
  Do not create another engine during render for the same container.

In an SSR host, render the glass subtree only after the client has mounted.
In Next.js App Router, use a Client Component and the host's supported mechanism
to skip server rendering for this subtree; `'use client'` alone is not a
client-only mount guard. See [Next.js guidance on skipping SSR](https://nextjs.org/docs/app/guides/lazy-loading#skipping-ssr).
Keep CSS imports in a location allowed by the host.
