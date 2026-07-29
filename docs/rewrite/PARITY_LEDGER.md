# Rewrite Parity Ledger

This ledger assigns every known legacy runtime capability and public claim a
rewrite disposition. `Preserve` means observable behavior remains compatible;
`Fix` means the intent remains but the documented defect must not; `Add` means
the README promised behavior that the legacy runtime did not implement; and
`Drop` means the item is intentionally outside the v1 rewrite contract.

The oracle for every legacy statement is
`dev@345a9be6906bcc8a801208054e7fe134c6bfe641`.

The S001-S006 legacy side is now durable under
`tests/baselines/legacy/visual/`, with Chrome/DPR/layout metadata in
`browser-dpr-{1,2}.json` and 20-run calibration plus key pixels in
`visual-calibration.json`. This evidence characterizes the oracle; it does not
mark the rewrite acceptance rows complete.

## Optical and rendering contract

| ID | Legacy behavior or claim | Evidence | Disposition | Rewrite acceptance |
| --- | --- | --- | --- | --- |
| OPT-001 | Active vertex shader source | `src/shaders/LiquidGlass.vert` | Preserve | Shipped source SHA-256 is `8ea709d1d999118002a6fdeca57ac499f878b1279d065a9dc59c42a102803a31`. |
| OPT-002 | Active advanced fragment shader source | `src/shaders/LiquidGlassAdvanced.frag`, imported by `liquidGlassRenderer.ts` | Preserve | Shipped source SHA-256 is `73de43a716b9b3418955ca582b2da8c624c7918f668459414062dff6c9126b38`. |
| OPT-003 | Rounded-rectangle SDF and per-corner radii | Advanced shader and renderer uniforms | Preserve | Symmetric and asymmetric radius fixtures match the calibrated oracle. |
| OPT-004 | Inverse CSS transform coordinate mapping | Advanced shader and material transforms | Preserve | Transformed material samples the same backdrop coordinates. |
| OPT-005 | Thickness displacement and index-of-refraction bending | Advanced shader | Preserve | Fixed-scene pixel output stays within the calibrated threshold. |
| OPT-006 | Mipmap LOD plus nine-tap blur | Advanced shader | Preserve | Blur values alter the sampled backdrop, not only CSS presentation. |
| OPT-007 | RGB dispersion | Advanced shader | Preserve | Non-zero dispersion produces the oracle channel separation. |
| OPT-008 | `saturation` prop | Material prop is watched but never passed to the renderer or shader | Drop | No v1 public option is exposed until a real shader contract and visual test exist. |
| OPT-009 | Explicit `refractIntensity: 0` | Falsy conditional spread in `LiquidRendererMaterialElement` | Fix | Zero reaches the shader unchanged and has a characterization test. |
| OPT-010 | Material tint, foreground color, shadow, inset border, rim illumination, and pointer highlight | `LiquidGlassMaterial.vue` styles | Preserve | Glass remains materially equivalent when the shader canvas is composited with CSS. |
| OPT-011 | Automatic four-level theme classification | Renderer sampling and material color mapping | Preserve | Typed feedback reports `ultra_dark`, `dark`, `light`, or `ultra_light` using configurable thresholds. |

## Interaction contract

| ID | Legacy behavior or claim | Evidence | Disposition | Rewrite acceptance |
| --- | --- | --- | --- | --- |
| INT-001 | Semi-implicit Euler spring step | `springStep` | Preserve | Scalar traces match within `1e-9`. |
| INT-002 | Delta time capped at 50 ms | `InteractionEngine.step` | Preserve | The capped-delta fixture matches within `1e-9`. |
| INT-003 | `button` preset | `BUTTON_PRESET` and trace fixture | Preserve | Hover follow, press stretch, origin shift, highlight, and bouncy release match. |
| INT-004 | `context-menu` preset | `CONTEXT_MENU_PRESET` and trace fixture | Preserve | No hover response, active stretch, origin shift, and partial idle-return policy remain. |
| INT-005 | `slider` preset | `SLIDER_PRESET` and trace fixture | Preserve | Velocity stretch, fixed origin, transparent active background, and jelly release match. |
| INT-006 | Custom preset overrides | Constructor merge and custom trace | Preserve | A typed partial config can override every supported preset value. |
| INT-007 | Deprecated legacy `interaction` object | `packages/vue/src/legacy-interaction.ts` and its tests | Fix | Vue retains the exact supported mapping for one migration window; the three legacy-only rebound fields remain no-ops, and new adapters use the typed preset/config API. |
| INT-008 | `disableInteractions`, `onlyClickInteractions`, and interactive descendants | `tests/browser/interaction-policy.spec.ts` and its support fixture | Preserve | Mouse and touch tests cover disabled, click-only, and nested button/input behavior. |
| INT-009 | `isMoveable` suppresses material-owned translation | Material config merge | Preserve intent | External drag can drive the material without double-applying pointer translation. |

## Composition, capture, and lifecycle contract

| ID | Legacy behavior or claim | Evidence | Disposition | Rewrite acceptance |
| --- | --- | --- | --- | --- |
| CMP-001 | Shared `uniform` canvas | Container and manager | Preserve | Multiple materials render in correct order on one presentation canvas. |
| CMP-002 | Per-material `dedicated` canvases | Material extraction path | Preserve | Dedicated and uniform scenes are visually equivalent within threshold. |
| CMP-003 | DOM-derived and explicit `renderOrder` | Manager material sort | Preserve | Automatic materials follow CSS z-index and live DOM order; every finite explicit order renders above the automatic group with deterministic tie handling. |
| CMP-004 | DOM capture with `html-to-image` | `LgBackdropConverter` default | Preserve | Primary capture path handles text, images, colors, mutation, and manual refresh. |
| CMP-005 | Selectable `html2canvas` capture | `captureLib` prop | Preserve as optional fallback | The fallback is lazy and tested; absence produces a contextual setup error rather than a silent failure. |
| CMP-006 | Custom canvas backdrop | `LgBackdropCanvas` | Preserve | Draw callback receives physical backing-store dimensions at DPR 1 and DPR 2, updates the refracted texture, and releases temporary resources. |
| CMP-007 | Backdrop `zIndex` | Both backdrop components | Preserve | Backdrop composition order follows numeric z-index. |
| CMP-008 | `watchResize` and `watchNodeChanges` props documented in README | Converter hardcodes both to true and declares neither prop | Add | Vue exposes both options with default `true`; equivalent core capture policy is available to all adapters. |
| CMP-009 | Converter viewport capture | `viewportCapture` prop | Fix | Capture peak work is bounded to the requested region; full-page rasterize-then-crop is not preserved. |
| CMP-010 | Body scroll, internal scroll, sticky material, and viewport manager mode | Manager scroll/viewport paths | Preserve intent | S005 and S006 pass with correct coordinates and bounded recapture frequency. |
| CMP-011 | Visibility culling and resize response | Intersection/resize observers and RAF layout | Preserve intent | Complete: every composite synchronously culls disconnected, invalid, empty, CSS-hidden, and non-intersecting transformed bounds while preserving partial intersections and context-excluded opacity. Shared ResizeObserver and filtered MutationObserver invalidation coalesce into material-only frames; shared IntersectionObserver pauses offscreen interaction RAF and resumes unfinished motion without becoming authoritative render visibility. All observer handles are reference-counted and context-owned. |
| CMP-012 | Nested glass full-canvas composition | Child manager backdrop registration | Preserve | S009 renders child glass into the parent without duplicate DOM capture. |
| CMP-013 | External material proxy delegation | `useExternalRenderer` and `useMaterialDelegation` | Preserve | S010 preserves coordinates, feedback, update, and unregister behavior. |
| CMP-014 | CSS fallback when WebGL is unavailable | Manager fallback state and material CSS | Preserve | Forced fallback remains readable and interactive with no WebGL context. |
| CMP-015 | Context loss/restoration | Not implemented | Add | Context loss pauses work, restoration rebuilds resources, and current materials/backdrop return. |
| CMP-016 | Resource cleanup | Partial `dispose`/`destroy` implementations | Fix | Textures, shaders, programs, buffers, canvases, observers, listeners, timers, and RAF counters return to zero. |
| CMP-017 | Capture lock and error recovery | Manager and converter async capture | Fix | Locks and temporary nodes are released in `finally`; a later capture can succeed after a failure. |
| CMP-018 | SSR-safe imports | Browser globals in runtime modules | Fix | Importing core and adapter entry points in Node does not access `window` or `document`. |
| CMP-019 | Inactive-page blurred appearance | Container blur, focus, and visibility listeners | Preserve intent | When enabled, window focus and document visibility update material presentation without redrawing WebGL; dynamic disable and context teardown release all listeners. |
| CMP-020 | Material update ownership and frame batching | Manager config merge and synchronous update paths | Fix | Complete: material add/update inputs are validated into detached transactional snapshots; invalid precommit work has no side effects and true no-ops schedule nothing. Committed same-frame updates merge by material in first-dirty order with field-level last-write-wins semantics, emit once per material, and share one material-only draw without re-uploading the backdrop texture. Presentation remains synchronous, while update-event, animation-presentation, and render failures drain executable frame work before the first error propagates. |

## Vue compatibility contract

| ID | Legacy behavior or claim | Evidence | Disposition | Rewrite acceptance |
| --- | --- | --- | --- | --- |
| VUE-001 | `LiquidGlass` component name and default slot | Public index and component | Preserve | Vue package exports a Composition API `<script setup>` component with the same role. |
| VUE-002 | Container props: `debug`, `renderPrecision`, `renderMode`, `enableBlurredEffect`, `scrollable`, `zIndex`, `themeColorThresholds` | `LiquidGlass.vue` | Preserve intent | Props map to core options with finite validation and documented defaults. |
| VUE-003 | Container exposes proxy and refresh controls | `defineExpose` in `LiquidGlass.vue` | Preserve | Typed handle exposes supported proxy, refresh, visibility, and layout operations without exposing mutable internals unnecessarily. |
| VUE-004 | `LiquidGlassMaterial` component and optical props | Public index and component | Preserve | Vue prop mapping produces the same core material options and appearance. |
| VUE-005 | Material slot props `updating`, `startUpdating`, `stopUpdating` | Material default slot | Preserve | Slot contract remains typed and runtime-real. |
| VUE-006 | Documented `backgroundColorChange` event | README; no `defineEmits` in component | Add | Vue emits a typed `backgroundColorChange` event whenever the effective theme mode changes. |
| VUE-007 | Documented material `colorDebounceMs` | README only | Drop | Theme feedback uses core update batching; no unsupported timing knob is exposed in v1. |
| VUE-008 | Documented material `zIndex` | README only; runtime uses CSS stacking and `renderOrder` | Replace | Use normal CSS `z-index` for DOM stacking and typed `renderOrder` for the render pipeline; no ambiguous prop. |
| VUE-009 | `LgBackdropConverter` name, slot, `captureLib`, `zIndex`, and `viewportCapture` | Public index and component | Preserve | Vue wrapper remains thin and delegates capture policy to core. |
| VUE-010 | `LgBackdropCanvas` name and draw callback | Public index and component | Preserve | Callback and redraw lifecycle remain typed, with physical dimensions and an identity transform at DPR 1 and DPR 2. |
| VUE-011 | `LiquidGlassDebugger` public component | Public index | Drop from production adapter | Typed diagnostics ship from core; the polished playground owns the debugger UI. |
| VUE-012 | Public `useMaterialDelegation` composable | Public index, but tightly coupled to legacy manager internals | Replace | Delegation remains an adapter-internal composable; consumers use typed material handles and `proxyTarget`. |
| VUE-013 | Public `useExternalRenderer` composable | Public index, but tightly coupled to legacy manager internals | Replace | External registration remains internal; the public container handle exposes the stable proxy interface. |
| VUE-014 | CSS class hooks for container, material, and highlight | README styling section | Preserve | Equivalent class names and CSS custom properties remain available without requiring internal DOM knowledge. |

## Cross-framework and package contract

| ID | Legacy behavior or claim | Evidence | Disposition | Rewrite acceptance |
| --- | --- | --- | --- | --- |
| PKG-001 | Legacy package is Vue-only `@agou/liquid-glass` | Legacy package manifest | Replace | Publish core plus framework-specific Vue, React, and Solid packages. |
| PKG-002 | Old package-name compatibility facade | No evidence of external consumers | Drop for v1 | Do not ship a facade unless usage evidence appears; provide a migration note. |
| PKG-003 | React support | User requirement; absent in legacy | Add | Packed React package installs and renders the same S001-S014 scene schema using functional components and hooks. |
| PKG-004 | Solid support | Rewrite architecture; absent in legacy | Add | Packed Solid package installs and renders the same S001-S014 scene schema. |
| PKG-005 | Framework-free engine | Rewrite architecture; renderer logic was coupled to Vue-era modules | Add | Core imports no Vue, React, or Solid and can render from plain TypeScript. |
| PKG-006 | Public numeric inputs | Legacy accepts unchecked values | Fix | Reject non-finite/out-of-range values with contextual typed errors. |
| PKG-007 | Fatal errors | Legacy frequently logs, returns null, or ignores draw errors | Fix | Core propagates contextual errors with original causes and adapters expose recoverable state. |
| PKG-008 | Event emitter behavior | Internal `EventEmitter` | Preserve | Listeners run in insertion order; duplicate registrations are allowed; `off` removes every identical reference; `on`/`off` remain chainable; `emit` returns `true` even with no listeners; listener exceptions propagate. |
| PKG-009 | Debug data | Legacy debugger reads manager internals | Replace | Stable typed diagnostic snapshots and resource counters ship; UI stays in the playground. |
| PKG-010 | Legacy UMD/CommonJS artifact | Legacy `main`, `require`, and Vite library output | Drop for v1 | Framework packages are typed ESM; packed-consumer tests prove the supported module path. |
| PKG-011 | Public interaction engine, factories, presets, and spring constants | Legacy public index | Preserve in core | Framework-neutral exports retain names and numeric behavior, with trace coverage. |
| PKG-012 | Public rendering, interaction, theme, and proxy types | Legacy wildcard type exports | Preserve intent in core | Portable contracts remain public; Vue-specific instance details are replaced by stable handles. |
| PKG-013 | Adapter CSS delivery | Legacy CSS was implicit in Vue component output | Fix | Each packed adapter exposes or imports the CSS required for the complete material appearance. |

## Intentional removals

| ID | Item | Reason | Verification |
| --- | --- | --- | --- |
| DRP-001 | `src/shaders/LiquidGlass.frag` | Inactive; advanced shader is the real renderer | No production import or package artifact. |
| DRP-002 | `LiquidGlassBackdropLayer.vue` | Empty component | No public export or consumer reference. |
| DRP-003 | `TextureBuilderWorker.ts` | Stub | No production worker entry. |
| DRP-004 | `three` peer dependency | Core uses raw WebGL2 and imports no Three.js | Packed manifests and dependency scan omit it. |
| DRP-005 | `.development/prediction.md` motion prediction | Design note, not runtime behavior | No implementation or public option. |
| DRP-006 | Old six-demo switcher and duplicated demo markup | Superseded by the compact cross-framework playground | New playground covers all ledger capabilities from one application. |
| DRP-007 | Placeholder Storybook application | Its scripts report success without testing behavior | Removed from workspace; real browser tests replace it. |

## Gate mapping

The P7 workbench sweep reaches S001-S012 from one application and proves every
scene remains usable without horizontal overflow at `1440x900`, `1024x768`,
`390x844`, and `360x800`. Representative desktop, compact, and mobile
screenshots are committed beside `tests/browser/workbench-visual.spec.ts`.

| Scenario | Ledger coverage | Durable acceptance evidence |
| --- | --- | --- |
| S001 Static single material | OPT-001 through OPT-007, OPT-010 | Legacy DPR 1/2 on/off calibration; `legacy-visual-parity.spec.ts`, `playground-shell.spec.ts`, `composition-scenes.spec.ts`, and `workbench-visual.spec.ts` |
| S002 Multiple materials | CMP-001, CMP-003 | Legacy DPR 1/2 on/off calibration; `legacy-visual-parity.spec.ts`, `playground-shell.spec.ts`, and `workbench-visual.spec.ts` |
| S003 DOM capture | CMP-004, CMP-005, CMP-008, CMP-009 | Legacy DPR 1/2 on/off calibration; `legacy-visual-parity.spec.ts`, `playground-shell.spec.ts`, and `workbench-visual.spec.ts` |
| S004 Interaction presets | INT-001 through INT-009 | Legacy DPR 1/2 pressed-state calibration; `legacy-visual-parity.spec.ts`, `interaction-presets.spec.ts`, `interaction-policy.spec.ts`, and `workbench-visual.spec.ts` |
| S005 Body scroll | CMP-010 | Legacy DPR 1/2 scrolled calibration; `legacy-visual-parity.spec.ts`, `scroll-capture.spec.ts`, and `workbench-visual.spec.ts` |
| S006 Internal scroll and sticky material | CMP-010, CMP-011 | Legacy DPR 1/2 scrolled calibration; `legacy-visual-parity.spec.ts`, `scroll-capture.spec.ts`, and `workbench-visual.spec.ts` |
| S007 CSS fallback | CMP-014 | `playground-shell.spec.ts` proves forced fallback and WebGL recovery through Vue, React, and Solid; `workbench-visual.spec.ts` proves responsive layout |
| S008 Dedicated mode | CMP-002 | `composition-scenes.spec.ts` proves clipping plus uniform/dedicated pixel parity through every adapter; `workbench-visual.spec.ts` provides compact/mobile evidence |
| S009 Nested glass | CMP-012 | `composition-scenes.spec.ts` proves nested rendering, resize, retirement, and remount through every adapter; `workbench-visual.spec.ts` proves responsive layout |
| S010 External proxy material | CMP-013 | `composition-scenes.spec.ts` proves delegated rendering, update, resize, retirement, and remount through every adapter; `workbench-visual.spec.ts` proves responsive layout |
| S011 Theme feedback | OPT-011, VUE-006 | `composition-scenes.spec.ts` proves all four feedback modes through every adapter; `workbench-visual.spec.ts` proves responsive layout |
| S012 Lifecycle stress | CMP-015 through CMP-019 | `composition-scenes.spec.ts` proves context loss/restoration, 20 mode switches, 20 remounts, resource retirement, and diagnostics; `workbench-visual.spec.ts` provides mobile evidence |
| S013 Packed Vue consumer | PKG-001, PKG-013, VUE-001 through VUE-014 | Pending P8 packed-consumer and SSR gates |
| S014 Packed React/Solid consumers | PKG-003 through PKG-005 | Pending P8 packed-consumer and SSR gates |

Every implementation phase must update this ledger when evidence changes. A
green unit test does not close a visual row, and a non-empty canvas does not
prove an optical row without a glass-on versus glass-off difference.
