# @agou/liquid-glass-solid — Agent Instructions

## Purpose

Solid adapter for `@agou/liquid-glass-core`. Wraps the core engine's imperative API in Solid-idiomatic components and primitives.

## Component Architecture

### LiquidGlass (Container Component)
```
Props:
  - options: GlassContextOptions
  - enableBlurredEffect?: boolean
  - debug?: boolean
  - class?: string
  - style?: JSX.CSSProperties
  - children?: JSX.Element

Provides (via Solid Context):
  - glassContext: GlassContext | null

Renders:
  <div ref={containerRef}>
    {children}                        ← Backdrop content
    <canvas ref={canvasRef} />        ← WebGL output layer
  </div>

Lifecycle:
  onMount    → create GlassContext
  onCleanup  → destroy GlassContext
```

### LiquidGlassMaterial (Glass Panel Component)
```
Props:
  - All MaterialConfig fields as individual props
  - proxyTarget?: ProxyTargetInterface
  - renderMode?: 'uniform' | 'dedicated'
  - class?: string
  - style?: JSX.CSSProperties
  - children?: JSX.Element

Consumes:
  - glassContext from LiquidGlassContext

Renders:
  <div ref={materialRef} class="..." style={...}>
    {children}
    <Show when={isDedicatedMode()}>
      <canvas ref={dedicatedCanvasRef} />
    </Show>
  </div>

Lifecycle:
  onMount    → glassContext.addMaterial(config)
  createEffect → glassContext.updateMaterial(id, changes) when props change
  onCleanup  → glassContext.removeMaterial(id)
```

## Hooks / Primitives

### useLiquidGlass(options: GlassContextOptions)
```
Returns: { glassContext, canvasRef, containerRef, isFallbackMode }
```
Creates and manages a GlassContext. Provides it via Solid Context API.

### useMaterial(config: MaterialConfig)
```
Returns: { materialRef, updateConfig, interactionState, setInteractionState }
```
Registers a material with the nearest GlassContext. Handles pointer events.

### useBackdropCapture(elementRef: HTMLElement)
```
Returns: { capture, isCapturing, error }
```
Captures a DOM element to canvas using the core DOMCapture utility.

### useInteraction(elementRef: HTMLElement)
```
Returns: { pointerState, handlers: { onPointerDown, onPointerMove, onPointerUp } }
```
Translates Solid pointer events to PointerState for the interaction engine.

## CSS Strategy

CSS custom properties set via Solid's `style` binding:

```tsx
<div
  ref={materialRef}
  style={{
    '--lg-blur': blur() + 'px',
    '--lg-border-radius': radii().map(r => r + 'px').join(' '),
  }}
/>
```

Rim illumination, highlight, and background tint are applied via computed styles using `createMemo`.

## Requirements

- Solid 1.9+ with TypeScript
- Use `createSignal` / `createMemo` for reactive state
- Use `onMount` / `onCleanup` for lifecycle
- Use `createContext` / `useContext` for dependency injection
- Use `ref` attribute for DOM element references
- All exports must have JSDoc comments
- Target: each component < 400 lines
