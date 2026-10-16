# @agou/liquid-glass-core

Framework-neutral WebGL2 liquid-glass engine.

```bash
pnpm add @agou/liquid-glass-core
```

```ts
import { GlassEngine } from '@agou/liquid-glass-core';

const engine = new GlassEngine();
const context = engine.createContext(container, {
  enableFallback: true,
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

The package includes `html-to-image` for DOM capture and installs `html2canvas`
as a secondary rasterizer. The `html2canvas` module is still loaded only when
selected, allowing application bundlers to keep it in a lazy chunk.

Imports are SSR-safe. Creating a context requires a client DOM, Canvas2D, and
WebGL2. Keep fallback enabled when CSS `backdrop-filter` is an acceptable
degraded presentation.

The public contract includes typed events, contextual errors, deterministic
registration handles, nested full-canvas composition, proxy delegation,
interaction presets, and structured resource diagnostics.

## Agent Skill

AI coding agents can install the library's integration skill from the
application directory:

```bash
npx skills add agoudbg/liquid-glass --skill liquid-glass
```

It includes core lifecycle examples, backdrop rules, presentation ownership,
and troubleshooting. See the [skill and installation options](https://github.com/agoudbg/liquid-glass#agent-skill).

MIT licensed.
