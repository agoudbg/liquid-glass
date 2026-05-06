# @agou/liquid-glass-vue — Agent Instructions

## Purpose

Vue 3 adapter for `@agou/liquid-glass-core`. Wraps the core engine's imperative API in Vue-idiomatic components and composables.

## Reference Code Mapping

| This Module | Reference File | Notes |
|---|---|---|
| `components/LiquidGlass.vue` | `components/LiquidGlass.vue` | Rewrite as thin wrapper (target: < 200 lines) |
| `components/LiquidGlassMaterial.vue` | `components/LiquidGlassMaterial.vue` | Rewrite as thin wrapper (target: < 300 lines) |
| `components/LgBackdropConverter.vue` | `components/LgBackdropConverter.vue` | Simplify, delegate capture to core |
| `components/LgBackdropCanvas.vue` | `components/LgBackdropCanvas.vue` | Simplify |
| `components/LiquidGlassDebugger.vue` | `components/LiquidGlassDebugger.vue` | Port as-is, minimal changes |
| `composables/useLiquidGlass.ts` | `core/LiquidContext.ts` | Rewrite: provide/inject GlassContext |
| `composables/useMaterial.ts` | `components/LiquidGlassMaterial.vue` (registration logic) | Extract material lifecycle into composable |
| `composables/useInteraction.ts` | `components/LiquidGlassMaterial.vue` (pointer events) | Extract pointer handling into composable |
| `composables/useMaterialDelegation.ts` | `composables/useMaterialDelegation.ts` | Port with simplifications |
| `composables/useExternalRenderer.ts` | `composables/useExternalRenderer.ts` | Port with simplifications |
| `styles/glass.css` | `components/LiquidGlassMaterial.vue` (<style> section) | Extract CSS to shared stylesheet using custom properties |

## Component Architecture

### LiquidGlass.vue (Container)
```
Props:
  - options: GlassContextOptions
  - enableBlurredEffect?: boolean
  - debug?: boolean

Provide:
  - glassContext: GlassContext (via provide/inject key)

Template:
  <div ref="containerRef">
    <slot />                          ← Backdrop content lives here
    <canvas ref="uniformCanvas" />    ← WebGL output layer
    <LiquidGlassDebugger v-if="debug" />
  </div>

Lifecycle:
  onMounted  → create GlassContext (via GlassEngine)
  onUnmounted → destroy GlassContext
```

### LiquidGlassMaterial.vue (Glass Panel)
```
Props:
  - All MaterialConfig fields as individual props
  - proxyTarget?: ProxyTargetInterface (for delegation)
  - renderMode?: 'uniform' | 'dedicated'

Inject:
  - glassContext: GlassContext

Template:
  <div ref="materialRef" class="liquid-glass-material">
    <slot />                          ← Content inside the glass panel
    <canvas v-if="isDedicatedMode" ref="dedicatedCanvas" />
  </div>

Lifecycle:
  onMounted  → glassContext.addMaterial(config)
  onUpdated  → glassContext.updateMaterial(id, changes)
  onUnmounted → glassContext.removeMaterial(id)
```

## CSS Strategy

All visual effects use CSS custom properties set by the component:

```css
.liquid-glass-material {
  --lg-blur: 10px;
  --lg-border-radius: 16px 16px 16px 16px;
  --lg-border-color: rgba(255, 255, 255, 0.3);
  --lg-background-tint: rgba(200, 200, 200, 0.1);
  --lg-border-opacity: 0.5;
}

.liquid-glass-material::before {
  /* Rim illumination via conic-gradient */
  border-image: conic-gradient(...);
}
```

## Delegation Mechanism

When a `LiquidGlassMaterial` has a `proxyTarget` pointing to a child `LiquidGlass`:
1. The parent material does NOT render its own glass in the parent's WebGL canvas
2. Instead, the material's glass effect is rendered by the child LiquidGlass
3. Position and transform updates are synchronized via RAF loop
4. The parent manager is notified to skip this material (markParentToSkip)

## Requirements

- Vue 3.5+ with Composition API (`<script setup>`)
- All components must use TypeScript with proper props typing
- All exports must have JSDoc comments
- Target: each component < 400 lines (delegate logic to composables)
