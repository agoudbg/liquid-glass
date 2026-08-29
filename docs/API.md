# API Reference

This reference describes the public `0.1.0` contract. Package declarations are
the final source for exact TypeScript shapes.

## Core Lifecycle

```ts
import { GlassEngine } from '@agou/liquid-glass-core';

const engine = new GlassEngine();
const context = engine.createContext(container, {
  renderMode: 'uniform',
  renderPrecision: 1,
});

const backdrop = context.addBackdropSource({
  kind: 'canvas',
  element: backdropCanvas,
  draw: (drawingContext, width, height) => {
    drawingContext.fillStyle = '#dce4df';
    drawingContext.fillRect(0, 0, width, height);
  },
});

const material = context.addMaterial({
  element: materialElement,
  radius: 28,
  thickness: 36,
  interactionPreset: 'button',
});

material.update({ refractIntensity: 0.7 });
backdrop.refresh();

material.destroy();
backdrop.destroy();
context.destroy();
engine.destroy();
```

`destroy()` is idempotent on engines, contexts, and registration handles.
Mutating operations on destroyed owners or handles throw a contextual
`GlassError`. Context diagnostics remain readable after destruction, event
detachment remains safe, and lifecycle state getters remain available.

## GlassEngine

| Member | Description |
| --- | --- |
| `new GlassEngine(runtime?)` | Create an engine. The optional runtime is intended for deterministic hosts and tests. |
| `createContext(container, options?)` | Create one independently rendered context and append its presentation canvas. |
| `destroy()` | Destroy every owned context and prevent future context creation. |
| `destroyed` | Whether engine teardown has completed. |

`createGlassEngine(runtime?)` is a convenience factory returning a new engine.

## GlassContextOptions

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `renderMode` | `'uniform' \| 'dedicated'` | `'uniform'` | Context-level presentation mode. A material may override it. |
| `renderPrecision` | `number` | `1` | Multiplies DPR. `0`, omitted, or non-finite values select `1`; positive values are clamped to at least `0.05`. |
| `enableFallback` | `boolean` | enabled | Allows CSS fallback when WebGL2 is unavailable or lost. |
| `enableBlurredEffect` | `boolean` | `false` | Reduces decorative presentation while the page is inactive. |
| `scrollable` | `boolean` | `false` | Makes the context content layer the internal scroll owner. |
| `canvasZIndex` | `number` | `9999` | Stacking level for core-owned presentation canvases. |
| `debug` | `boolean` | `false` | Enables measurements and `diagnosticsUpdated` events. |
| `themeColorThresholds` | `ThemeColorThresholds` | calibrated defaults | Overrides luma boundaries for automatic theme feedback. |

`context.updateOptions(nextOptions)` replaces the complete option snapshot.
Pass every option that should remain active.

## GlassContext

| Member | Description |
| --- | --- |
| `canvas` | Core-owned visible 2D presentation canvas. |
| `destroyed` | Whether all owned resources are released. |
| `fallbackMode` | Whether CSS fallback currently owns presentation. |
| `addBackdropSource(config)` | Register a DOM or custom-canvas source. |
| `addMaterial(config)` | Register a measurable material element. |
| `updateOptions(options)` | Replace the context options in place. |
| `createProxyInterface()` | Create a stable target for delegated materials. |
| `setFallbackMode(enabled)` | Force or release CSS fallback. |
| `setViewportMode(enabled)` | Toggle viewport-limited capture. |
| `refresh(reason?)` | Request capture, composition, and material rendering. |
| `getDiagnostics()` | Return a detached diagnostics snapshot. |
| `requestContextLoss()` | Request diagnostic WebGL loss when supported. |
| `requestContextRestore()` | Request diagnostic restoration after loss. |
| `on(event, handler)` | Subscribe and receive an unsubscribe function. |
| `off(event, handler)` | Remove a specific subscription. |
| `destroy()` | Release registrations, observers, tasks, canvases, and WebGL resources. |

## Backdrop Sources

### Canvas

```ts
const handle = context.addBackdropSource({
  kind: 'canvas',
  element: canvas,
  boundsElement: optionalLayoutElement,
  mirrorToElement: true,
  draw: (drawingContext, width, height) => {},
  zIndex: 10,
  scale: 1,
  watchResize: true,
  watchPositionChanges: true,
});
```

The draw callback uses physical pixels and an identity transform. `scale`
changes sampling resolution, not CSS layout size.

### DOM

```ts
const handle = context.addBackdropSource({
  kind: 'dom',
  element,
  captureLibrary: 'html-to-image',
  backgroundColor: '#ffffff',
  scale: 1,
  watchResize: true,
  watchNodeChanges: true,
  watchPositionChanges: false,
  viewportCapture: {
    enabled: true,
    bufferX: 40,
    bufferY: 80,
  },
});
```

`captureLibrary` accepts `html-to-image` or `html2canvas`. Core installs both
rasterizers, while `html2canvas` remains dynamically loaded only when selected.
Capture has a five-second owned timeout and reports errors through the context
error boundary.

Backdrop handles expose `id`, `destroyed`, `update(changes)`, `refresh()`, and
idempotent `destroy()`. `element` and `kind` cannot be replaced in place.

## MaterialConfig

| Option | Type | Default or behavior |
| --- | --- | --- |
| `element` | `HTMLElement` | Required and immutable for the registration. |
| `radius` | `number` | Uses computed CSS radius in core; adapters default to `24`. |
| `radiusTR/BR/BL/TL` | `number` | Override individual corners. |
| `thickness` | `number` | `10` |
| `refractIndex` | `number > 0` | `1.1` |
| `refractIntensity` | `number >= 0` | `0.5`; explicit `0` is preserved. |
| `blur` | `number >= 0` | `0` in core. |
| `dispersion` | `number >= 0` | `0.01` |
| `disableInteractions` | `boolean` | Disable pointer-driven output. |
| `onlyClickInteractions` | `boolean` | Ignore hover-only input while preserving press input. |
| `isMoveable` | `boolean` | Suppress translation and hover-follow for a moveable host. |
| `interactionPreset` | preset | `button`, `context-menu`, `slider`, or `custom`. |
| `interactionConfig` | partial config | Validated overrides applied to the selected preset. |
| `renderMode` | render mode | Override the context mode for this material. |
| `renderOrder` | `number` | Explicit draw ordering. |
| `proxyTarget` | proxy interface | Render this element through another context. |

All public numeric values must be finite and satisfy their documented minimum.
Unknown fields are rejected.

Material handles expose:

- `update(changes)` for validated, frame-coalesced updates.
- `getPresentation()` for a detached CSS presentation snapshot.
- `onPresentation(listener)` for immediate and subsequent snapshots.
- `setInteractionState(state)` for framework pointer translation.
- `refreshLayout()` for explicit remeasurement.
- `destroy()` for idempotent teardown.

## Appearance Options

Framework material components also accept:

| Option | Type | Description |
| --- | --- | --- |
| `useCustomColor` | `boolean` | Use an explicit tint instead of sampled theme colors. |
| `backgroundColor` | `string` | CSS tint used when custom color is active. |
| `illuminationAngle` | `number` | Rim-light direction in degrees. |
| `illuminationIntensity` | `number` | Rim-light strength in the inclusive `0..1` range. |

Adapters map appearance and interaction output to stable `--lg-*` CSS custom
properties without forcing framework component renders on every animation
frame.

## Events

`GlassContext` supports these typed events:

| Event | Payload |
| --- | --- |
| `diagnosticsUpdated` | `DiagnosticsSnapshot` |
| `backdropCaptured` | source ID, canvas, dimensions, optional viewport rectangle |
| `materialsRendered` | complete material canvas and optional theme map |
| `fullCanvasRendered` | complete nested-context composition |
| `materialAdded` | material ID and config |
| `materialUpdated` | material ID and coalesced changes |
| `materialRemoved` | material ID |
| `fallbackModeChanged` | effective fallback boolean |
| `viewportModeChanged` | viewport boolean |
| `compositeRequested` | dirty reason and priority |
| `materialFeedback` | lifecycle or sampled-theme feedback |
| `error` | `GlassErrorContext` with original cause |
| `destroyed` | no payload |

Off-screen material and full-composition canvases are produced on demand when
their respective events have observers. Visible presentation is always updated.

## Framework Adapters

### Vue

Runtime exports:

- `LiquidGlass`
- `LiquidGlassMaterial`
- `LgBackdropCanvas`
- `LgBackdropConverter`
- `useLiquidGlassContext`

`LiquidGlass` emits `ready` and `error` and exposes `getContext`, `refresh`,
`refreshVisibility`, and `getProxyTarget`. `LiquidGlassMaterial` exposes
`getHandle` and `refreshLayout` and emits `backgroundColorChange`.

### React

Runtime exports:

- `LiquidGlass`
- `LiquidGlassMaterial`
- `BackdropCanvas`
- `BackdropConverter`
- `LiquidGlassContext`
- `useLiquidGlassContext`

Use `ref` for the imperative container, material, and converter handles.

### Solid

Solid exports the same component names as React plus
`LiquidGlassContext` and `useLiquidGlassContext`. Use `apiRef` callbacks for
imperative handles.

## Diagnostics

`getDiagnostics()` remains available after destruction. The schema reports:

- lifecycle and renderer state;
- effective DPR, render precision, render mode, viewport, and fallback causes;
- material and backdrop registrations;
- capture, material, and delegation schedulers;
- canvases, listeners, observers, tasks, timers, and WebGL resources;
- optional frame, capture, error, context-loss, and context-restore metrics.

The current diagnostics schema version is `1`.
