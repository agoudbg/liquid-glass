# Liquid Glass

Cross-framework WebGL2 liquid-glass rendering for arbitrary DOM content.
The renderer preserves the refraction shader and interaction behavior of the
original Vue draft while moving lifecycle, capture, composition, and graphics
ownership into a framework-neutral TypeScript core.

The current release candidate is `0.1.0`. It includes production adapters for
Vue 3, React 19, and Solid, plus a compact playground covering static materials,
DOM capture, interactions, scrolling, fallback, dedicated canvases, nested
glass, proxy delegation, theme feedback, and context recovery.

## Packages

| Package | Purpose |
| --- | --- |
| `@agou/liquid-glass-core` | Framework-neutral WebGL2 engine and typed imperative API |
| `@agou/liquid-glass-vue` | Vue 3 Composition API components |
| `@agou/liquid-glass-react` | React 19 functional components and context |
| `@agou/liquid-glass-solid` | Solid components and context |

All adapter packages export their stylesheet as `style.css`. Import it once in
the client entry point.

## Install

Choose one adapter. The adapter resolves core at runtime; install core as a
direct dependency as well when application code imports its types or
framework-neutral API, as the examples below do.

```bash
pnpm add @agou/liquid-glass-vue @agou/liquid-glass-core
```

```bash
pnpm add @agou/liquid-glass-react @agou/liquid-glass-core
```

```bash
pnpm add @agou/liquid-glass-solid @agou/liquid-glass-core
```

Use `@agou/liquid-glass-core` directly when a framework wrapper is not needed.

```bash
pnpm add @agou/liquid-glass-core
```

## Agent Skill

AI coding agents can use the bundled [Liquid Glass skill](skills/liquid-glass/SKILL.md)
to integrate the library into an application. It includes framework-specific
examples, DOM and canvas backdrop guidance, client-only mounting rules,
troubleshooting, and browser verification steps.

Install it from your application directory with the
[Skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add agoudbg/liquid-glass --skill liquid-glass
```

Select your coding agent when prompted. To install from a local checkout,
replace `agoudbg/liquid-glass` with the checkout's path. You can also copy the
complete `skills/liquid-glass` folder, including `references` and `agents`, into
your agent's supported skills directory. Installing an npm package does not
install the skill.

Ask your agent to use `liquid-glass` when adding or troubleshooting the effect.
The skill describes consuming the packages; `AGENTS.md` describes developing
this repository.

## Shared Backdrop

The examples below use the same deterministic canvas source. Draw callbacks
receive physical backing-store dimensions after DPR and render precision are
applied.

```ts
import type { CustomDrawCallback } from '@agou/liquid-glass-core';

export const drawBackdrop: CustomDrawCallback = (context, width, height) => {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#d8e9e2');
  gradient.addColorStop(0.52, '#f4d45f');
  gradient.addColorStop(1, '#e8816d');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
};
```

## Vue

```ts
// main.ts
import '@agou/liquid-glass-vue/style.css';
```

```vue
<script setup lang="ts">
import {
  LgBackdropCanvas,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-vue';

import { drawBackdrop } from './draw-backdrop';
</script>

<template>
  <LiquidGlass class="glass-stage" :render-precision="1">
    <LgBackdropCanvas :draw="drawBackdrop" />
    <LiquidGlassMaterial
      class="glass-material"
      :radius="32"
      :thickness="42"
      :refract-intensity="0.76"
    >
      Vue liquid glass
    </LiquidGlassMaterial>
  </LiquidGlass>
</template>
```

Vue also preserves the legacy `LgBackdropConverter` name and its
`requestBackdropRedraw` slot control. `LiquidGlassMaterial` emits
`backgroundColorChange` when backdrop sampling changes the effective theme.

## React

```tsx
// main.tsx
import '@agou/liquid-glass-react/style.css';
```

```tsx
import {
  BackdropCanvas,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-react';
import type { JSX } from 'react';

import { drawBackdrop } from './draw-backdrop';

export function GlassExample(): JSX.Element {
  return (
    <LiquidGlass className="glass-stage" options={{ renderPrecision: 1 }}>
      <BackdropCanvas draw={drawBackdrop} />
      <LiquidGlassMaterial
        className="glass-material"
        radius={32}
        thickness={42}
        refractIntensity={0.76}
      >
        React liquid glass
      </LiquidGlassMaterial>
    </LiquidGlass>
  );
}
```

## Solid

```tsx
// main.tsx
import '@agou/liquid-glass-solid/style.css';
```

```tsx
import {
  BackdropCanvas,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-solid';
import type { Component } from 'solid-js';

import { drawBackdrop } from './draw-backdrop';

export const GlassExample: Component = () => (
  <LiquidGlass class="glass-stage" options={{ renderPrecision: 1 }}>
    <BackdropCanvas draw={drawBackdrop} />
    <LiquidGlassMaterial
      class="glass-material"
      radius={32}
      thickness={42}
      refractIntensity={0.76}
    >
      Solid liquid glass
    </LiquidGlassMaterial>
  </LiquidGlass>
);
```

## Layout

The container and material need measurable dimensions. The adapter stylesheet
owns canvas positioning and material appearance; application CSS owns layout.

```css
.glass-stage {
  min-height: 360px;
}

.glass-material {
  height: 48%;
  left: 16%;
  padding: 28px 36px;
  position: absolute;
  top: 26%;
  width: 68%;
}
```

## DOM Capture

Use `LgBackdropConverter` in Vue or `BackdropConverter` in React and Solid to
capture existing DOM. `html-to-image` is the default and is included by core.
`html2canvas` is also installed by core, but remains a lazy secondary rasterizer
that bundlers load only when selected.

Cross-origin images must provide usable CORS headers. A tainted canvas or failed
rasterizer is reported as a typed `CAPTURE_FAILED` error.

## Playground

The first screen is the actual workbench, not a landing page.

```bash
pnpm dev
```

It exposes the same scene state through Vue, React, and Solid hosts. URL state
includes the selected framework, scenario, render mode, precision, capture
mode, and optical controls.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build
pnpm test:consumers
pnpm test:browser
pnpm test:visual
pnpm test:runtime
```

`pnpm verify` runs the release gate in order. Runtime acceptance compares the
new build with the fixed legacy commit and then executes a five-minute
lifecycle soak.

On Windows, `pnpm test:visual` resolves the exact Chrome for Testing
`150.0.7871.129` distribution used by the committed oracle. The first run
downloads the official archive into a versioned local cache after verifying its
SHA-256; later runs revalidate the calibrated distribution files before reuse.

## Release Workflow

User-facing package changes use Changesets:

```bash
pnpm changeset
```

After the change is merged into `main`, GitHub Actions creates or updates a
`Version Packages` pull request. Merging that pull request runs the complete
release gate, publishes the four fixed-version packages to npm, creates package
tags, and creates a GitHub Release. Ordinary commits without a changeset do not
publish packages.

The initial prerelease line starts at `1.0.0-alpha.0`:

```bash
pnpm changeset pre enter alpha
```

Add a one-time major changeset for the four packages. Later alpha releases use
`alpha.1`, `alpha.2`, and so on, and are available through the npm `alpha`
dist-tag. To publish the stable line, run `pnpm changeset pre exit` and merge
the generated Version Packages pull request.

The four npm packages must each configure GitHub Actions Trusted Publishing for
this repository and `.github/workflows/publish.yml`. The GitHub repository must
also allow Actions to create and approve pull requests. No long-lived npm token
is stored in the repository.

## Documentation

- [API reference](docs/API.md)
- [Migration from the legacy Vue draft](docs/MIGRATION.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Browser and SSR support](docs/BROWSER_SUPPORT.md)
- [Visual baseline policy](docs/VISUAL_BASELINES.md)
- [Release notes](docs/RELEASE_NOTES.md)
- [Legacy evidence boundary](docs/rewrite/LEGACY_BASELINE.md)
- [Capability parity ledger](docs/rewrite/PARITY_LEDGER.md)

## License

[MIT](LICENSE)
