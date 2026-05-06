# @agou/liquid-glass-react — Agent Instructions

## Purpose

React 19 adapter for `@agou/liquid-glass-core`. Wraps the core engine's imperative API in React-idiomatic components and hooks.

## Component Architecture

### LiquidGlass (Container Component)
```
Props:
  - options: GlassContextOptions
  - enableBlurredEffect?: boolean
  - debug?: boolean
  - className?: string
  - style?: CSSProperties
  - children?: ReactNode

Provides (via React Context):
  - glassContext: GlassContext | null

Renders:
  <div ref={containerRef}>
    {children}                        ← Backdrop content
    <canvas ref={canvasRef} />        ← WebGL output layer
  </div>

Lifecycle:
  useEffect (mount)    → create GlassContext
  useEffect (cleanup)  → destroy GlassContext
```

### LiquidGlassMaterial (Glass Panel Component)
```
Props:
  - All MaterialConfig fields as individual props
  - proxyTarget?: ProxyTargetInterface
  - renderMode?: 'uniform' | 'dedicated'
  - className?: string
  - style?: CSSProperties
  - children?: ReactNode

Consumes:
  - glassContext from LiquidGlassContext

Renders:
  <div ref={materialRef} className="..." style={...}>
    {children}
    {isDedicatedMode && <canvas ref={dedicatedCanvasRef} />}
  </div>

Lifecycle:
  useEffect (mount)    → glassContext.addMaterial(config)
  useEffect (update)   → glassContext.updateMaterial(id, changes)
  useEffect (cleanup)  → glassContext.removeMaterial(id)
```

### BackdropConverter (DOM Capture Component)
```
Props:
  - children: ReactNode
  - scale?: number
  - backgroundColor?: string
```

### BackdropCanvas (Custom Draw Component)
```
Props:
  - draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
```

## Hooks

### useLiquidGlass()
```
Returns: { glassContext, canvasRef, containerRef, isFallbackMode }
```
Creates and manages a GlassContext. Provides it via React Context.

### useMaterial(config: MaterialConfig)
```
Returns: { materialRef, updateConfig, interactionState, setInteractionState }
```
Registers a material with the nearest GlassContext. Handles pointer events and interaction state.

### useBackdropCapture(elementRef: RefObject<HTMLElement>)
```
Returns: { capture, isCapturing, error }
```
Captures a DOM element to canvas using the core DOMCapture utility.

### useMaterialDelegation(proxyTarget: ProxyTargetInterface)
```
Returns: { isDelegating, feedbackState }
```
Sets up cross-component material delegation (sending end).

### usePointerInteraction(elementRef: RefObject<HTMLElement>)
```
Returns: { pointerState, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave } }
```
Translates React pointer events to PointerState for the interaction engine.

## CSS Strategy

CSS Modules (`.module.css` files) with CSS custom properties:

```css
/* glass.module.css */
.material {
  --lg-blur: 10px;
  --lg-border-radius: 16px;
  /* ... */
}
```

Rim illumination, highlight, and background tint are applied via computed inline styles passed through `style` prop, using CSS custom properties as the primary configuration mechanism.

## Requirements

- React 19+ with TypeScript
- Use `useRef` for DOM element references (never `document.getElementById`)
- Use `useCallback` for stable callback references passed to core
- Use `useMemo` for derived material config
- All exports must have JSDoc comments
- Target: each component < 400 lines
