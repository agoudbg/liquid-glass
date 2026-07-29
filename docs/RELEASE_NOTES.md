# Release Notes

## 0.1.0

`0.1.0` is a rewrite of the working Vue draft at
`dev@345a9be6906bcc8a801208054e7fe134c6bfe641`.

### Added

- Framework-neutral `GlassEngine`, `GlassContext`, backdrop registrations, and
  material registrations.
- Vue 3, React 19, and Solid adapters using real public core APIs.
- Uniform and dedicated presentation.
- DOM capture through bundled `html-to-image`.
- Lazy optional `html2canvas` capture.
- Custom canvas backdrops.
- Multiple materials, ordering, asymmetric radii, and complete optical values.
- Button, context-menu, slider, and custom interaction configurations.
- Legacy tint, shadow, inner border, illumination, and pointer highlight.
- Body scroll, internal scroll, viewport capture, and visibility policy.
- Nested full-canvas composition and typed proxy material delegation.
- Automatic light/dark/ultra theme feedback.
- CSS fallback, inactive-page blurred policy, WebGL context loss, and
  restoration.
- Structured diagnostics with deterministic resource counters.
- SSR-safe imports and a Solid `node` conditional entry.
- Packed Vue, React, and Solid consumer verification.
- Responsive cross-framework playground with URL-addressable controls.

### Intentional Differences From The Legacy Draft

- The old Vue-only `@agou/liquid-glass` facade is not shipped.
- Core no longer exposes manager internals.
- `LiquidGlassDebugger` is replaced by typed diagnostics and the repository
  playground.
- Public manager-coupled `useMaterialDelegation` and `useExternalRenderer`
  composables are replaced by stable proxy interfaces.
- No-op `saturation` is removed.
- Documentation-only `colorDebounceMs` and material `zIndex` are removed.
- Backdrop `watchResize`, `watchNodeChanges`, and position tracking are real
  lifecycle options.
- Vue `backgroundColorChange` is a real typed event.
- Invalid numeric inputs, destroyed owners, shader failures, capture failures,
  and lifecycle failures surface contextual errors.
- Explicit numeric zero values are preserved.
- Resource teardown is complete and idempotent.
- Storybook placeholder scripts are removed; Playwright and the shared
  playground are the visual contract.

### Compatibility Evidence

- Active shader sources match the legacy SHA-256 hashes byte-for-byte.
- Interaction physics traces match deterministic legacy outputs at `1e-9`.
- Six calibrated legacy scenarios pass at DPR 1 and DPR 2.
- Exact visual parity uses a SHA-256-verified Chrome for Testing
  `150.0.7871.129` distribution instead of an auto-updated system installation.
- S001-S012 run through Vue, React, and Solid.
- Packed tarballs typecheck, build, SSR-import, preview, and render non-empty
  glass outside the monorepo.
- Final relative performance, same Windows machine and Chrome 150:
  - candidate P95 frame median: `25.0 ms`;
  - legacy P95 frame median: `25.1 ms`;
  - candidate P95 DOM capture median: `17.3 ms`;
  - legacy P95 DOM capture median: `64.9 ms`;
  - candidate long-task median: `0`;
  - legacy long-task median: `11`.
- The formal lifecycle soak ran for `302.1 s` and completed 139 scene/framework
  actions. Final active contexts, live resources, and retired resources were
  all zero with `NO_ERROR`.

Performance results are machine-relative acceptance evidence, not general
benchmark claims.

### Browser Scope

Chrome 150 on Windows is the calibrated release target. Responsive layouts are
covered at desktop, compact, and mobile viewports. Other Chromium browsers are
expected to work but are not release-blocking; Firefox and Safari remain
unverified for calibrated visual parity.

### Migration

See [MIGRATION.md](./MIGRATION.md) for package, component, option, event,
delegation, diagnostics, and SSR changes.
