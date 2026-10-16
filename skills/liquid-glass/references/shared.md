# Shared Integration Rules

## Layout used by the framework examples

Save this as application-owned `glass.css`. Import it after the adapter
stylesheet. Adapt the geometry to the user's design while keeping the container,
backdrop, and material measurable.

```css
.glass-stage {
  position: relative;
  width: 100%;
  height: 360px;
  isolation: isolate;
}

.glass-backdrop {
  box-sizing: border-box;
  min-height: 360px;
  padding: 32px;
  color: #173c38;
  background:
    repeating-linear-gradient(90deg, transparent 0 39px, #173c3840 40px 42px),
    linear-gradient(120deg, #d8e9e2, #f4d45f 52%, #e8816d);
}

.glass-stage .glass-panel {
  box-sizing: border-box;
  position: absolute;
  top: 96px;
  right: 8%;
  left: 8%;
  width: auto;
  height: auto;
  min-height: 140px;
  padding: 24px;
}
```

The adapter stylesheet owns the presentation layers and `--lg-*` variables.
Application CSS owns placement and size. Preserve the library's canvas,
transform, and content-layer styles when adapting an existing design.

## Choose and refresh the backdrop

| Source | Use | Refresh |
| --- | --- | --- |
| DOM converter | Existing DOM that must appear behind the glass | Converter handle `refresh()` after pixels change without a detected DOM mutation |
| Canvas backdrop | Procedural artwork, charts, or other application-drawn pixels | Update the `draw` callback prop when its drawing inputs change; in core, call the canvas source handle's `refresh()` |

Converters capture their children. Put the material beside the converter within
`LiquidGlass`; wrapping the glass itself can capture the rendered effect again.
Keep source order and dimensions consistent with the visible background.

For custom drawing, import `CustomDrawCallback` from core and pass a stable
callback to `LgBackdropCanvas` in Vue or `BackdropCanvas` in React and Solid:

```ts
import type { CustomDrawCallback } from '@agou/liquid-glass-core';

const drawBackdrop: CustomDrawCallback = (context, width, height) => {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#d8e9e2');
  gradient.addColorStop(0.5, '#f4d45f');
  gradient.addColorStop(1, '#e8816d');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
};
```

The callback receives physical backing-store dimensions with an identity
transform. Do not multiply by device pixel ratio again. `scale` changes source
sampling resolution, not CSS size. For a change of canvas element or source
`kind` in core, destroy that registration and create a new one. Canvas drawing
is invalidation-driven; the callback does not create an animation loop.
Keep the callback stable while its drawing inputs are unchanged. When they
change, pass a new callback through the adapter prop (for example, a Vue
computed callback, React `useCallback` with dependencies, or a Solid reactive
callback). Container `refresh()` can reuse cached canvas pixels; it does not
invalidate the source. Use a core-owned source handle for explicit per-frame
invalidation when the application needs an animated canvas source.

## Configuration and ownership

- Material optics include `radius`, `thickness`, `refractIndex`,
  `refractIntensity`, `blur`, and `dispersion`. Preserve explicit zero values.
- Context options include `renderMode`, `renderPrecision`, `enableFallback`,
  `scrollable`, and `debug`. `context.updateOptions()` replaces the complete
  option snapshot. Pass all options that must remain active.
- Adapter-only appearance props include `edgeStyle` (`illuminated` or `dark`),
  `useCustomColor`, `backgroundColor`, `illuminationAngle`, and
  `illuminationIntensity`. Do not pass appearance-only props to core
  `addMaterial()` or `material.update()`.
- `interactionPreset` accepts `button`, `context-menu`, `slider`, or `custom`.
  Use `interactionConfig` for supported overrides and `disableInteractions` to
  disable pointer-driven motion. A visual preset does not provide button
  semantics; retain native controls, keyboard behavior, and focus indication.
- Adapters own their context, backdrop, and material registrations. If supplying
  a shared `engine`, the application owns destroying that engine after its users
  unmount. With direct core usage, the application owns all teardown.

## Capture, performance, and failure handling

`html-to-image` is the default rasterizer. Core installs `html2canvas` as a lazy
secondary rasterizer selected with `captureLibrary: 'html2canvas'`. Selection is
explicit; it is not an automatic retry path. Changing rasterizers does not
bypass cross-origin restrictions. Use images with suitable CORS headers and
inspect typed `CAPTURE_FAILED` errors. Context `error` events retain the cause
in their `error` field; caught `GlassError` instances expose `cause`.
Failed captures have an owned five-second timeout; avoid continuous retries of
an unchanged failing source.

`renderPrecision` multiplies device pixel ratio. Lower positive values reduce
GPU and capture work. `0` selects the default precision of `1`; it does not
disable rendering. Consider `viewportCapture` on DOM converters for large
scrolling content, and measure the result on the target device.

Keep fallback enabled unless the application deliberately requires WebGL2.
CSS fallback needs browser `backdrop-filter` support and does not reproduce the
shader's exact refraction. All package imports are SSR-safe; context creation
and component mounting still require a browser. Use the host framework's
client-only mounting mechanism without suppressing hydration errors.

## Diagnose an empty or stale effect

1. Check that the stylesheet is imported and container, material, and source
   have nonzero bounds and overlap in the viewport.
2. Confirm that a backdrop source is registered and contains the intended
   pixels, and that application CSS has not hidden or covered the canvas.
3. Read `getContext()` from the adapter's container handle after mount. Inspect
   `context.fallbackMode`, `context.getDiagnostics()`, and `context.on('error',
   handler)`; keep and call the returned unsubscribe function for subscriptions
   owned by the application.
4. For changed DOM pixels call converter `refresh()`. For custom-canvas pixels,
   update the adapter's `draw` callback or call the core backdrop handle's
   `refresh()`. For changed geometry call the material handle's `refreshLayout()`. During a
   geometry animation, bracket work with the material render controls'
   `startUpdating()` and `stopUpdating()`, or core's `startLayoutUpdates()` and
   `stopLayoutUpdates()`. Stop on completion, cancellation, and owner cleanup so
   an interrupted transition does not leave per-frame layout work running.

Observe the actual effect in the target browser. Responsive layout coverage
does not establish support for every mobile GPU. Safari and Firefox do not yet
have the library's calibrated visual parity evidence.
