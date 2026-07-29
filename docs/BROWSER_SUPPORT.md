# Browser And SSR Support

## Runtime Requirements

The full glass renderer requires:

- WebGL2;
- Canvas2D with readable same-origin pixels;
- standard DOM layout and computed styles;
- `requestAnimationFrame`;
- pointer events for interactions;
- `ResizeObserver`, `MutationObserver`, and `IntersectionObserver` for automatic
  lifecycle behavior where the browser provides them.

Observer APIs degrade to explicit refresh behavior when unavailable. WebGL2
degrades to CSS fallback only when the browser supports `backdrop-filter` and
fallback remains enabled.

## Tested Browser

Release-blocking browser, visual, packed-consumer, performance, and stability
tests run in installed Google Chrome on Windows using isolated contexts.

The `0.1.0` evidence was captured with Chrome 150:

- legacy visual oracle: `150.0.7871.129`;
- final relative performance and stability run: `150.0.7871.184`;
- viewports include `1440x900`, `1024x768`, `390x844`, and `360x800`;
- visual baselines include DPR 1 and DPR 2.

Other Chromium browsers are expected to work when they expose the same WebGL2
and DOM features, but they are not release-blocking targets yet.

Firefox and Safari have not completed the calibrated visual matrix for
`0.1.0`. Treat them as unverified rather than claiming parity. Applications
targeting them should keep fallback enabled and run their own capture fixtures.

## Mobile

The playground layout is tested at `390x844` and `360x800`. This proves
responsive application layout, not every mobile GPU or memory limit.

Use lower `renderPrecision` and bounded viewport capture for high-DPR devices or
large scrolling sources.

## SSR

All four package entry points can be imported without browser globals. The
packed-consumer gate cold-imports installed tarballs in Node.

SSR import safety does not make WebGL rendering server-side. Context creation
and adapter mounting require a browser client with real layout.

Solid provides a dedicated `node` conditional entry. Vue and React entry points
are also module-evaluation safe, but their components should be mounted only in
client code.

## Capture Compatibility

`html-to-image` is the included primary DOM rasterizer. `html2canvas` is a lazy
optional path supplied by the consuming application.

Rasterizer support can be narrower than browser support. Cross-origin images,
tainted canvases, embedded documents, video, and complex CSS may require
application-specific handling.

## Fallback Contract

Fallback preserves layout and material content while replacing shader output
with CSS filtering and appearance tokens. It is a resilience mode, not a
pixel-identical replacement for WebGL refraction.
