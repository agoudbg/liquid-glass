# Framework-Neutral Core

Prefer an adapter when the application already uses Vue, React, or Solid. Use
core directly when the application owns browser DOM and rendering lifecycle.

```sh
pnpm add @agou/liquid-glass-core
```

Core has no `style.css` export. The application owns material appearance and DOM
layout as well as initialization, pointer translation, and cleanup. The snippet
below initializes an existing, measurable container and its two distinct child
elements; it is not a complete visual component.

```ts
import { GlassEngine } from '@agou/liquid-glass-core';

/** Attach glass rendering to application-owned browser elements. */
export function mountGlass(
  container: HTMLElement,
  backdropElement: HTMLElement,
  materialElement: HTMLElement,
): () => void {
  const engine = new GlassEngine();
  try {
    const context = engine.createContext(container, {
      enableFallback: true,
      renderPrecision: 1,
    });
    context.on('error', (error) => {
      console.error('Liquid Glass rendering failed', error);
    });
    context.addBackdropSource({
      kind: 'dom',
      element: backdropElement,
      watchNodeChanges: true,
      watchResize: true,
    });
    context.addMaterial({
      element: materialElement,
      radius: 28,
      thickness: 36,
      refractIntensity: 0.7,
      disableInteractions: true,
    });

    return () => engine.destroy();
  } catch (error) {
    engine.destroy();
    throw error;
  }
}
```

Call the returned function when the application releases these elements.
Destroying an engine destroys its contexts, registrations, and event listeners.
Destruction is idempotent; mutations after destruction throw contextual errors.
If the application shares an engine, destroy only its owned context here and
release the shared engine after all users are finished.

## Core-specific decisions

- Give the container positioned layout, a visible backdrop, and an overlapping
  material. Read `material.getPresentation()` or subscribe through
  `material.onPresentation()` to apply the framework-facing CSS presentation
  when building your own wrapper. `MaterialDomPresentationController` is a
  public helper for this binding; it still needs application-owned CSS and a
  highlight element. Adapter appearance props are not accepted by `addMaterial()`.
- To use a canvas source, pass `kind: 'canvas'`, an `HTMLCanvasElement`, and a
  `CustomDrawCallback`. Use `mirrorToElement: true` when its generated pixels
  should also be drawn into the visible source canvas. Do not capture the glass
  output canvas as its own backdrop.
- `material.update(changes)` updates optics. `material.refreshLayout()` requests
  geometry measurement. `backdrop.refresh()` requests new source pixels.
- For custom pointer handling, pass the declared `InteractionState` shape to
  `material.setInteractionState()`, or use the exported `MaterialPointerController`
  and `bindMaterialPointerEvents` helpers. Core does not attach the adapter's
  pointer event handlers for an application-owned material.
- `context.updateOptions(next)` replaces its option snapshot. Keep a complete
  application-owned options object and pass the resulting snapshot each time.
- For delegation, obtain `context.createProxyInterface()` from a live target
  and pass it as the material's `proxyTarget`. Destroy delegated registrations
  before independently destroying their target. Start with one context unless
  the requested design needs nesting or delegation.

See [shared rules](shared.md) for capture errors, fallback constraints, and
browser validation. In direct core usage, apply presentation snapshots and CSS
fallback appearance explicitly; the adapters normally perform that work.
