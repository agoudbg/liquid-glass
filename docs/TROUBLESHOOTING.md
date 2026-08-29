# Troubleshooting

## The Glass Canvas Is Blank

1. Give the `LiquidGlass` container and material measurable width and height.
2. Confirm the material is inside the container's content layer.
3. Check `context.getDiagnostics().presentation.rendererState`.
4. Check the context `error` event for shader, texture, or capture failures.
5. Confirm the material and backdrop are visible and intersect the viewport.
6. Verify application CSS does not hide `.liquid-glass-canvas`.

Enabling `debug` provides frame counts, draw calls, WebGL errors, and live
resource counters.

## WebGL2 Is Unavailable

The renderer requires WebGL2. Keep `enableFallback` enabled to use the CSS
`backdrop-filter` presentation when WebGL2 cannot be created or is lost.

```ts
const context = engine.createContext(container, {
  enableFallback: true,
});
```

Listen for `fallbackModeChanged` to reflect the effective mode in application
UI. Calling `setFallbackMode(true)` forces fallback for diagnostics.

## DOM Capture Fails

Common causes:

- a cross-origin image lacks CORS headers;
- a canvas is tainted;
- the source contains browser features unsupported by the selected rasterizer;
- the capture exceeds the five-second timeout;
- `html2canvas` was selected after optional dependencies were omitted.

The default `html-to-image` path is bundled. Package managers normally install
the optional fallback; add it explicitly when optional dependencies were omitted:

```bash
pnpm add html2canvas
```

Handle `CAPTURE_FAILED` errors and inspect the retained `cause` and `backdropId`.
Do not retry continuously without changing the failing source.

## The Image Looks Soft Or Uses Too Much Memory

`renderPrecision` multiplies device pixel ratio:

```ts
context.updateOptions({
  renderPrecision: 0.75,
});
```

Lower values reduce backing-store dimensions and GPU/capture work. The minimum
effective positive precision is `0.05`. Use viewport capture for large scrolling
DOM sources and avoid unnecessarily large source `scale` values.

## A Material Does Not Update

- Call `material.update(changes)` for optical or interaction changes.
- Call `material.refreshLayout()` after application code changes geometry
  without a detectable resize or position event.
- Call `backdrop.refresh()` after external pixels change.
- In adapters, keep draw callbacks stable when possible and update props rather
  than replacing the entire container.

Material updates are coalesced by animation frame. A true no-op schedules no
event or draw.

## Dedicated Mode Looks Different

Dedicated mode uses one visible canvas per dedicated material but draws the same
ordered WebGL frame as uniform mode. Check:

- the material has non-zero dimensions;
- CSS clipping and border radii match the material;
- the canvas is not covered by application stacking contexts;
- `renderMode` is not overridden at both context and material levels.

The playground S008 scenario compares uniform and dedicated output.

## Nested Or Proxy Glass Is Empty

Nested framework containers connect automatically only when the child is
rendered inside the parent component tree. Explicit delegation requires a live
target interface from `getProxyTarget()` or `createProxyInterface()`.

Destroy proxy material registrations before destroying an independently owned
target context. Framework adapters perform this ordering automatically.

## Context Restoration Does Not Complete

`requestContextLoss()` and `requestContextRestore()` depend on
`WEBGL_lose_context` and may return `false`. When supported:

1. wait for diagnostics renderer state `context-lost`;
2. request restoration;
3. wait for renderer state `ready`;
4. inspect `contextRestoreCount` and the error event.

The renderer rebuilds programs, buffers, textures, and the first presentation
frame before leaving fallback.

## SSR Import Works But Rendering Fails

SSR safety covers module import. Context creation needs browser DOM, computed
layout, Canvas2D, and WebGL2. Create or mount glass only after the client DOM is
available.

## Reporting A Reproducible Failure

Include:

- adapter and package versions;
- browser version, OS, viewport, and DPR;
- context and material options;
- `getDiagnostics()` before and after the failure;
- the smallest playground scenario or consumer fixture that reproduces it;
- console and context error output.

Do not attach unreviewed capture output containing private DOM content.
