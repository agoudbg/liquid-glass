# Legacy Baseline

This document fixes the evidence boundary for the rewrite. The legacy oracle is
the exact Git object `dev@345a9be6906bcc8a801208054e7fe134c6bfe641`. Production
code, tests, and CI must never import from `.plan/reference`; that directory is
only a local, ignored convenience copy.

## Oracle identity

| Field | Value |
| --- | --- |
| Commit | `345a9be6906bcc8a801208054e7fe134c6bfe641` |
| Parent | `7859f347cdfb983189d37524a8fe6ffb0e1bc3d9` |
| Commit date | `2026-01-20T17:39:25+08:00` |
| Branch containing the commit at capture time | `dev` |
| Tracked files | 52 |
| Tracked source files under `src/` | 37 |
| Local reference identity | 52 of 52 tracked files have identical Git blob hashes |

The identity check compared every path returned by `git ls-tree -r` for the
oracle commit with the corresponding file under `.plan/reference` using Git
blob hashes. Extra ignored files under `.plan/reference` are not part of this
claim.

## Shader integrity

The renderer imports `LiquidGlassAdvanced.frag`; `LiquidGlass.frag` is present
but inactive.

| Shader | Role | SHA-256 |
| --- | --- | --- |
| `src/shaders/LiquidGlass.vert` | Active vertex shader | `8ea709d1d999118002a6fdeca57ac499f878b1279d065a9dc59c42a102803a31` |
| `src/shaders/LiquidGlassAdvanced.frag` | Active fragment shader | `73de43a716b9b3418955ca582b2da8c624c7918f668459414062dff6c9126b38` |
| `src/shaders/LiquidGlass.frag` | Inactive legacy fragment shader | `b8626f2b0e405bba33bb813d79c94635f3c8ae042930cc417cd1bf2f7bd60d3d` |

The active shader bytes, including whitespace and comments, are parity inputs.
Tests should hash the shipped sources and compare them with the first two
values above.

## Runtime inventory

### Vue surface

The legacy package is Vue-only. It exports these runtime components:

- `LiquidGlass`
- `LiquidGlassMaterial`
- `LgBackdropConverter`
- `LgBackdropCanvas`
- `LiquidGlassDebugger`

It also exports `useMaterialDelegation`, `useExternalRenderer`, all declarations
from `types/LiquidGlass.ts` and `types/ExternalMaterial.ts`, the
`InteractionEngine`, four factory functions, four preset-map entries, and four
spring constants. The two composables are implementation-facing despite being
publicly reachable; the interaction API and portable data types are real
cross-framework candidates.

`LiquidGlass` accepts `debug`, `renderPrecision`, `renderMode`,
`enableBlurredEffect`, `scrollable`, `zIndex`, and `themeColorThresholds`. It
exposes `proxyInterface`, `externalMaterials`, `calculateCanvasCoords`,
`manager`, `refresh`, `refreshVisibility`, and `markLayoutDirty`.

`LiquidGlassMaterial` accepts the optical values `thickness`, `refractIndex`,
`refractIntensity`, `radius`, the four corner radii, `blur`, and `dispersion`.
It also accepts custom tinting, interaction flags and presets, the deprecated
legacy interaction object, `isMoveable`, illumination values, `proxyTarget`,
`renderMode`, and `renderOrder`. Its default slot receives `updating`,
`startUpdating`, and `stopUpdating`.

`LgBackdropConverter` accepts `captureLib`, `zIndex`, and `viewportCapture`.
Its default slot receives `requestBackdropRedraw`. `LgBackdropCanvas` accepts a
required `draw` callback and optional `zIndex`.

The README also claims material `colorDebounceMs`, material `zIndex`, backdrop
`watchResize`, backdrop `watchNodeChanges`, and a
`backgroundColorChange` component event. Those claims are not implemented by
the component prop/event declarations and are tracked as documentation drift in
[PARITY_LEDGER.md](./PARITY_LEDGER.md).

### Rendering behavior

The active fragment shader implements a rounded-rectangle signed-distance
field, inverse CSS transform mapping, thickness displacement, index-of-
refraction bending, mipmap LOD blur, a nine-tap blur kernel, and RGB dispersion.
The material presentation adds the legacy transform, tint, shadow, inner
border, illumination, and pointer highlight in CSS.

The runtime supports:

- Shared `uniform` and per-material `dedicated` presentation.
- Multiple materials with DOM-derived or explicit render order.
- DOM capture through `html-to-image` and a selectable `html2canvas` path.
- Custom canvas backdrops.
- Nested glass composition and cross-component material delegation.
- Body and internal scrolling, viewport-sized manager buffers, optional
  converter viewport cropping, resize tracking, and visibility culling.
- CSS `backdrop-filter` fallback when WebGL cannot be used.
- Four interaction configurations: `button`, `context-menu`, `slider`, and
  custom overrides.
- Backdrop luma sampling with `ultra_dark`, `dark`, `light`, and `ultra_light`
  material modes.

### Legacy demo scenes

The old switcher contains six scenes. These are inventory entries, not URL
routes: the switcher selects them in local Vue state.

| ID | Source | Primary coverage |
| --- | --- | --- |
| `blog` | `src/demo/LiquidGlassBlogDemo.vue` | DOM capture, scroll, dedicated mode, uniform override, multiple materials |
| `showcase` | `src/demo/LiquidGlassShowcase.vue` | Optical controls, asymmetric radii, multiple materials, all built-in interaction presets |
| `playground` | `src/demo/LiquidGlassPlayground.vue` | Direct renderer, custom image backdrop, live optical controls |
| `multi` | `src/demo/MultiGlassDemo.vue` | Direct renderer with three differently configured materials |
| `app` | `src/demo/AppDemo.vue` | Nested containers, DOM and canvas backdrops, proxy delegation, resize/drag, debugger |
| `app2` | `src/demo/App2Demo.vue` | Nested scrollable DOM capture with floating materials |

## Verified evidence

An isolated copy of the oracle commit completed `pnpm build:demo` with Vite.
The legacy `vue-tsc` project-reference configuration fails with TS6310, so its
type-check result is not a quality baseline.

The repository's global browser policy used an isolated, headless Chrome
context at 1440 by 900. The following scenes were observed with at least one
non-empty canvas and zero console errors:

| Scene | Isolated build | Browser canvas | Console errors | Durable screenshot |
| --- | --- | --- | --- | --- |
| `blog` | Pass | Non-empty | 0 | Missing |
| `showcase` | Pass | Non-empty | 0 | Missing |
| `multi` | Pass | Non-empty | 0 | Missing |
| `app` | Pass | Non-empty | 0 | Missing |
| `playground` | Pass as part of bundle | Not recorded | Not recorded | Missing |
| `app2` | Pass as part of bundle | Not recorded | Not recorded | Missing |

The exact Chrome version, DPR, canvas dimensions, material rectangles, pixel
samples, and per-scene screenshots were not retained. A transient Blog image
outside the repository is deliberately not treated as a baseline artifact.

## Deterministic numeric evidence

[`physics-traces.json`](../../tests/baselines/legacy/physics-traces.json)
records a controlled pointer sequence for every built-in preset and one custom
configuration. It was produced by executing the oracle
`src/core/InteractionEngine.ts` directly with Node 22 type stripping, a
controlled `performance.now()`, a 240 by 120 element, fixed pointer timestamps,
and fixed animation-frame timestamps. Values are stored to 12 significant
digits and are intended for comparisons with an absolute tolerance of `1e-9`.

The fixture is self-contained data. It does not import `.plan/reference` and
must be replayed against the rewritten interaction modules in CI.

## Known defects to fix, not preserve

1. `LiquidGlass.vue` only removes one manager listener during unmount. It does
   not dispose the manager, its nested backdrop registration, or window focus,
   blur, and visibility listeners.
2. The raw renderer's `dispose()` only cancels an animation ID, deletes the VAO,
   and unbinds the program. It does not delete the program, compiled shaders,
   vertex buffer, or textures. Replacing a backdrop creates another texture
   without deleting the previous one.
3. `LiquidRendererBackdropElement` creates a `MutationObserver` in a local
   variable and never disconnects it in `destroy()`.
4. `LiquidRendererManager.captureBackdrop()` sets its capture lock before
   several early returns and awaited operations without a surrounding
   `try/finally`. A missing context or thrown capture can leave the lock set and
   can leave a temporary background element attached.
5. The `html-to-image` viewport path still rasterizes the full scrollable
   element and crops afterward. It reduces retained canvas size but not peak
   capture cost.
6. `LiquidRendererMaterialElement` conditionally spreads
   `refractIntensity`; an explicit value of `0` is lost and falls back to the
   default.
7. Public numeric inputs are not consistently checked for finiteness or valid
   ranges.
8. Browser globals are used by runtime paths without an explicit SSR import
   contract, and WebGL context loss/restoration is not handled.
9. Fatal shader, context, and capture failures are frequently logged or ignored
   instead of being surfaced with contextual errors.
10. The public `saturation` material prop is watched but never reaches either
    the renderer or shader, so it has no visual effect.

## Missing Phase 0 capture work

The current baseline is sufficient for source and numeric parity, but visual
parity is not yet fully calibrated. Before declaring Phase 0 complete:

1. Replay all six scenes from the exact oracle in an isolated worktree.
2. Fix Chrome version, viewport, DPR, fonts, reduced-motion state, and asset
   readiness in the capture metadata.
3. Capture each scene twenty times to measure self-diff noise.
4. Persist screenshots, canvas dimensions, material rectangles, glass-on and
   glass-off pixel regions, and key pixel probes under
   `tests/baselines/legacy/`.
5. Calculate the scene threshold as `max(0.1%, 3 * selfDiff)`, capped at
   `0.5%`, while ignoring channel deltas of 3 or less in the first pass.

Until those artifacts exist, a successful build or a non-empty canvas proves
that rendering occurred, not that the rewrite is visually identical.

## Replay rule

Always reconstruct the legacy app from the Git commit, never from the active
rewrite tree. Use an isolated worktree or copy, install with a separate Codex
pnpm store, run `pnpm build:demo`, and serve `dist-demo`. Do not modify, merge,
or depend on `dev`, and do not make `.plan/reference` a production or CI input.
