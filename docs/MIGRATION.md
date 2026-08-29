# Migration From The Legacy Vue Draft

The legacy `dev@345a9be` package was Vue-only and exposed manager internals.
Version `0.1.0` keeps the optical and interaction behavior but replaces
ownership and package boundaries.

## Package Names

| Legacy | Rewrite |
| --- | --- |
| `@agou/liquid-glass` | No compatibility facade in v1 |
| Vue components | `@agou/liquid-glass-vue` |
| Renderer and portable types | `@agou/liquid-glass-core` |
| React adapter | `@agou/liquid-glass-react` |
| Solid adapter | `@agou/liquid-glass-solid` |

Install the Vue adapter and import its stylesheet:

```bash
pnpm add @agou/liquid-glass-vue
```

```ts
import '@agou/liquid-glass-vue/style.css';
```

## Preserved Vue Components

These names remain:

- `LiquidGlass`
- `LiquidGlassMaterial`
- `LgBackdropConverter`
- `LgBackdropCanvas`

The container and material are still composition surfaces. The converter slot
still provides `requestBackdropRedraw`; `refresh` is the preferred new name.
`captureLib` remains a Vue alias, while `captureLibrary` is the portable name.

## Container Changes

Legacy top-level Vue props remain available for the common path:

- `debug`
- `renderPrecision`
- `renderMode`
- `enableBlurredEffect`
- `scrollable`
- `zIndex`
- `themeColorThresholds`

New code should prefer the `options` object:

```vue
<LiquidGlass
  :options="{
    debug: true,
    renderMode: 'uniform',
    renderPrecision: 1,
    enableFallback: true,
  }"
/>
```

When both forms are present, legacy top-level Vue props take precedence.
Legacy `zIndex` maps the uniform canvas one level below the requested material
stacking level.

The old exposed manager methods and instances are intentionally gone:

- `manager`
- `externalMaterials`
- `calculateCanvasCoords`
- `markLayoutDirty`

Use the limited exposed surface instead:

- `getContext()`
- `refresh()`
- `refreshVisibility()`
- `getProxyTarget()`

## Material Changes

Optical values, asymmetric radii, render order, uniform/dedicated mode,
interaction presets, moveable behavior, tint, illumination, and proxy targets
are preserved.

The old `interaction` object remains on Vue for one migration window. Prefer:

```vue
<LiquidGlassMaterial
  interaction-preset="button"
  :interaction-config="{ activeScale: 0.94 }"
/>
```

These legacy documentation-only or no-op fields are not part of v1:

| Field | Disposition |
| --- | --- |
| `saturation` | Dropped because it never reached the legacy shader. |
| `colorDebounceMs` | Dropped; core frame batching owns theme updates. |
| material `zIndex` prop | Replaced by `renderOrder` and normal CSS stacking. |

An explicit `refractIntensity: 0` now remains zero instead of falling back to
the default.

`backgroundColorChange` is now a real typed Vue event:

```vue
<LiquidGlassMaterial
  @background-color-change="(mode) => console.log(mode)"
/>
```

The value is one of `light`, `dark`, `ultra_light`, or `ultra_dark`. The event
fires only when the sampled mode changes.

## Backdrop Changes

The rewrite implements previously documented lifecycle controls:

- `zIndex`
- `watchResize`
- `watchNodeChanges`
- `watchPositionChanges`
- `viewportCapture`
- `backgroundColor`
- `scale`

`html-to-image` remains the default. The `html2canvas` path is lazy and declared
as an optional core dependency. Applications using `--omit=optional` can add it
explicitly:

```bash
pnpm add html2canvas
```

If selected without the package available, capture fails with contextual
`CAPTURE_FAILED` data instead of silently changing rasterizers.

## Nested And Delegated Glass

Nested `LiquidGlass` components connect automatically through framework
context. Legacy `useMaterialDelegation` and `useExternalRenderer` are no longer
public manager-facing composables.

For explicit delegation, obtain a stable proxy target from the target
container and pass it to a material:

```ts
const proxyTarget = glassHandle.getProxyTarget();
```

```vue
<LiquidGlassMaterial :proxy-target="proxyTarget" />
```

Core users call `context.createProxyInterface()`.

## Debugging

`LiquidGlassDebugger` is not shipped in adapter packages. Stable typed data is
available through:

```ts
const snapshot = context.getDiagnostics();
const stop = context.on('diagnosticsUpdated', (next) => {
  // Render diagnostics in application-owned UI.
});
```

The repository playground is the reference debugger presentation.

## Errors And Lifecycle

The rewrite does not preserve silent fatal failures. Shader, capture, render,
configuration, and lifecycle errors surface as `GlassError` values or typed
context error events with their original causes.

Framework unmount now releases contexts, registrations, captures, observers,
listeners, animation frames, timers, canvases, and WebGL resources. Manual core
owners must still call `destroy()`.

## SSR

Package imports no longer read `window` or `document` at module evaluation.
Importing is SSR-safe; creating a context still requires a client DOM and
layout. Mount adapter components only in the client portion of the application.

Solid publishes a dedicated `node` entry selected by conditional exports.

## Visual Compatibility

The active vertex and fragment shader sources are byte-identical to the legacy
oracle. Physics traces are compared at `1e-9`, and S001-S006 use committed DPR 1
and DPR 2 Chrome baselines. Intentional differences are listed in
[RELEASE_NOTES.md](./RELEASE_NOTES.md).
