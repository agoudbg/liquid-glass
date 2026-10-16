---
name: liquid-glass
description: Integrate, configure, or troubleshoot @agou/liquid-glass in Vue 3, React 19, Solid, or plain TypeScript applications. Use for real WebGL glass over DOM or canvas backdrops, including capture, layout, interactions, fallback, and client-only mounting.
---

# Liquid Glass

Use the published `@agou/liquid-glass-*` packages to add glass to the user's
application. Preserve its framework, layout, content, and controls. This skill
covers consuming the library; repository development rules live in `AGENTS.md`.

## Choose the integration

Inspect the application's dependencies, installed package versions, and client
entry point. Use its package manager and existing framework. Install one adapter;
add core as a direct dependency when importing core types or its imperative API.
Keep adapter and core versions aligned, including prerelease versions.

Read [shared integration rules](references/shared.md), then the relevant guide:

| Application | Package | Guide |
| --- | --- | --- |
| Vue 3.5+ | `@agou/liquid-glass-vue` | [Vue](references/vue.md) |
| React 19+ | `@agou/liquid-glass-react` | [React](references/react.md) |
| Solid 1.9+ | `@agou/liquid-glass-solid` | [Solid](references/solid.md) |
| Framework-neutral DOM | `@agou/liquid-glass-core` | [Core](references/core.md) |

The bundled guides target the public API in the `1.0.0-alpha.0` package source.
Read the installed package's declarations before using an unfamiliar prop or
method. If its version differs, check the corresponding release documentation.
Use public package exports; internal source paths and legacy draft components
are not application APIs.

## Build the effect

1. Import the adapter's `style.css` once through the application's supported
   stylesheet entry. Give the container and material measurable dimensions.
2. Register a backdrop inside `LiquidGlass`. Wrap existing DOM in the framework's
   converter, or use its canvas backdrop for application-drawn pixels. Keep glass
   materials as siblings of the captured DOM so the capture excludes the glass.
3. Place `LiquidGlassMaterial` inside the same container. Configure optics on the
   material and context settings on the container's `options` object. Vue also
   supports top-level context props. Do not move those Vue props to React or Solid.
4. Keep creation and mounting in client code. Imports are SSR-safe, but rendering
   needs real browser layout, Canvas2D, and WebGL2.
5. Update props or registration handles in place. Request backdrop refresh when
   external pixels change, and refresh layout when geometry changes without an
   observed event. Let adapters own their registrations and cleanup.

For DOM capture, the source must actually contain the background to refract.
A page background outside every registered source does not automatically become
a texture. A CSS blur on the material alone does not verify WebGL refraction.

## Validate in the consuming application

- Run its relevant typecheck, lint, tests, and build commands. Check imports
  against the installed declarations, including the stylesheet export.
- In a browser, confirm that the backdrop and material have nonzero bounds and
  overlap. Use contrasting source details to inspect refraction at the edge.
- Compare the scene with the material hidden. Confirm that the rendered glass
  changes the background while text and controls remain usable.
- Check the console and context `error` events. Inspect `fallbackMode` and
  `getDiagnostics()` when output is blank or differs from expectations.
- Exercise the requested interactions, scrolling or background updates, narrow
  layout, and unmount/remount behavior. Check that reduced-motion requirements
  from the host application are honored; `disableInteractions` disables the
  library's pointer response when needed.

Report which checks ran. If browser verification is unavailable, distinguish
compiled integration from a visually verified effect.

## Additional API details

The skill's references are bundled so installation does not depend on a clone of
this repository. For advanced configuration, consult the matching release's
package declarations and these upstream documents:

- [API reference](https://github.com/agoudbg/liquid-glass/blob/main/docs/API.md)
- [Troubleshooting](https://github.com/agoudbg/liquid-glass/blob/main/docs/TROUBLESHOOTING.md)
- [Browser and SSR support](https://github.com/agoudbg/liquid-glass/blob/main/docs/BROWSER_SUPPORT.md)

These links follow `main` and can describe a newer release than the application.
