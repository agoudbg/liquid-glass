## Context for Liquid Glass repo

- Core pieces: `LiquidRendererManager` (render pipeline), `LiquidGlass.vue` (container + uniform canvas mirroring), `LiquidGlassMaterial.vue` (material registration + interactions), `LgBackdropConverter`/`LgBackdropCanvas` (backdrop capture sources), and `useExternalRenderer` (cross-component delegation).
- Nested glass relies on context/depth from `LiquidGlass.vue`; keep z-index math aligned with manager expectations.
- `renderMode` supports `'uniform'` today. The `'dedicated'` path is stubbed in `LiquidRendererManager` and lacks per-material canvas mounting—treat as TODO, not a working feature.
- Fallback mode: when WebGL is unavailable, materials switch to CSS `backdrop-filter` while layout/interaction logic continues.

## Documentation expectations

- When adding or finishing features (e.g., implementing `renderMode: 'dedicated'` or adjusting render precision inheritance), update README and relevant docs/demos in the same change set.
- Call out experimental or unfinished options explicitly; avoid advertising unimplemented modes without a caveat.
- Keep examples aligned with the uniform render path until the dedicated pipeline is complete.
