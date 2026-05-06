# @agou/liquid-glass-core — Agent Instructions

## Reference Code Mapping

The original implementation is preserved at `.plan/reference/src/`. When working on any module in this package, open the corresponding reference file side by side to ensure behavioral parity:

| This Module | Reference File | What to Extract |
|---|---|---|
| `types/glass.ts` | `types/LiquidGlass.ts` + `types/ExternalMaterial.ts` | All interfaces, enums, config types |
| `types/events.ts` | `types/LiquidGlass.ts` (event-related types) + `core/EventEmitter.ts` | Event type definitions |
| `types/interaction.ts` | `core/InteractionEngine.ts` (config types) | Spring preset configs, interaction state |
| `events/TypedEventEmitter.ts` | `core/EventEmitter.ts` | Rewrite with generics (no `any`) |
| `utils/uuid.ts` | `utils/uuid.ts` | Copy verbatim |
| `utils/opacity.ts` | `utils/opacity.ts` | Copy verbatim |
| `utils/feature-detect.ts` | `utils/featureDetect.ts` | Copy logic, restructure API |
| `shaders/LiquidGlass.vert` | `shaders/LiquidGlass.vert` | **Copy verbatim — do NOT modify** |
| `shaders/LiquidGlassAdvanced.frag` | `shaders/LiquidGlassAdvanced.frag` | **Copy verbatim — do NOT modify** |
| `renderer/WebGLRenderer.ts` | `core/liquidGlassRenderer.ts` | Context creation, draw loop, material rendering |
| `renderer/ShaderCompiler.ts` | `core/liquidGlassRenderer.ts` (shader compile sections) | Shader compilation, linking, attribute extraction |
| `renderer/TexturePool.ts` | `core/liquidGlassRenderer.ts` (texture sections) | Texture creation, upload, mipmap, destroy |
| `renderer/UniformBinder.ts` | `core/liquidGlassRenderer.ts` (uniform sections) | Uniform setting per draw call |
| `interaction/InteractionEngine.ts` | `core/InteractionEngine.ts` | **Copy logic verbatim — must produce identical numbers** |
| `interaction/presets.ts` | `core/InteractionEngine.ts` (preset constants) | Extract 3 preset configs |
| `interaction/transforms.ts` | `core/LiquidRendererMaterialElement.ts` (matrix parsing) | CSS transform matrix parse + inverse |
| `backdrop/DOMCapture.ts` | `components/LgBackdropConverter.vue` (capture logic) | html-to-image wrapper, timeout, error handling |
| `backdrop/BackdropElement.ts` | `core/LiquidRendererBackdropElement.ts` | DOM element position/visibility tracking |
| `backdrop/BackdropCompositor.ts` | `core/LiquidRendererManager.ts` (captureBackdrop section) | Multi-source backdrop compositing |
| `engine/GlassEngine.ts` | `core/LiquidContext.ts` + entry point | Factory for GlassContext |
| `engine/GlassContext.ts` | `core/LiquidRendererManager.ts` | RAF loop, scheduling, lifecycle management |
| `engine/MaterialManager.ts` | `core/LiquidRendererManager.ts` (material CRUD) | Material registration, dirty flags, update tracking |
| `engine/MaterialElement.ts` | `core/LiquidRendererMaterialElement.ts` | DOM element position/transform tracking |
| `engine/BackdropManager.ts` | `core/LiquidRendererManager.ts` (backdrop sections) | Backdrop source management, capture trigger |
| `engine/ViewportAdapter.ts` | `core/LiquidRendererManager.ts` (viewport sections) | Mobile viewport mode, canvas sizing, DPR clipping |
| `engine/CompositePipeline.ts` | `core/LiquidRendererManager.ts` (composite sections) | Nested LiquidGlass compositing, throttle control |

## Module Dependency Order

Modules must be built in this order — each module only depends on modules listed above it:

```
1. types/           # Zero dependencies — pure TypeScript interfaces
2. events/          # Depends on: types
3. utils/           # Depends on: nothing (pure utilities)
4. shaders/         # Depends on: nothing (raw GLSL strings)
5. renderer/        # Depends on: types, shaders
6. interaction/     # Depends on: types
7. backdrop/        # Depends on: types, utils
8. engine/          # Depends on: types, events, utils, renderer, interaction, backdrop
```

## Extraction Rules

### For Shaders (LiquidGlass.vert, LiquidGlassAdvanced.frag)
- **Copy verbatim.** Do not rename variables. Do not reorder operations. Do not "clean up" code.
- These shaders have been tested across multiple browsers and devices. Any change risks visual artifacts that are nearly impossible to debug.
- The file `LiquidGlass.frag` (old circular SDF shader) should be **ignored** — it is preserved for historical reference only and should not be used or extracted.

### For Physics Math (InteractionEngine.ts)
- **Copy logic verbatim.** Spring equations, damping calculations, origin shift formulas must produce identical numerical results.
- Write unit tests that compare output values against reference implementation.
- The only allowed changes: TypeScript type annotations, variable naming conventions, code organization.

### For WebGL Rendering (renderer/*)
- Extract at the function level. Each function should do one thing.
- Verify GL API call order matches reference exactly.
- Use WebGL mock for unit tests to verify API call sequences.

### For DOM Operations (backdrop/*, engine/*)
- Isolate DOM access behind clear interfaces.
- Use `HTMLElement` references passed from framework adapters.
- Do not assume any framework lifecycle — operate imperatively.

## Testing Strategy

### Unit Tests (vitest, runs in Node.js)
- All types: validation of config objects
- EventEmitter: event dispatch, removal, count
- UUID: uniqueness across 1000 generations
- Opacity: correct cumulative calculation for nested elements
- Feature detection: correct classification of environments
- Interaction engine: numerical output verification
- Matrix transforms: correct parse and inverse
- WebGL API calls: mock-based verification of call sequences

### Browser Tests (vitest browser mode)
- WebGL context creation: real canvas element
- Shader compilation: real GLSL compile + link
- Backdrop capture: real DOM-to-canvas conversion
- Material element: real DOM position tracking
- Viewport culling: IntersectionObserver behavior

### Visual Regression (Storybook + Chromatic)
- Core: WebGL output with different parameters
- Vue: Component rendering in various configurations
- React: Component rendering in various configurations
- Mobile: Viewport mode, fallback mode

## Key Architectural Decisions

1. **GlassEngine is a factory, not a singleton.** Each container element gets its own `GlassContext`. This enables multiple independent LiquidGlass instances on the same page.

2. **Backdrop is always an OffscreenCanvas.** The backdrop canvas is created once per context and reused across frames to reduce GC pressure.

3. **Materials configure the shader, the shader does the rendering.** Material config (position, size, radii, thickness, IOR, blur, dispersion) is translated to WebGL uniforms and scissor rects. The shader does not know about "materials" — it only knows about uniforms.

4. **Interaction output feeds back as transforms.** The interaction engine produces origin shifts and scale values that are fed into the material's CSS transform matrix, which is then passed to the shader as a uniform.

5. **Nested LiquidGlass uses composite rendering.** When a LiquidGlass container is nested inside another, the inner container renders to an `OffscreenCanvas` and the outer container samples that canvas as a backdrop source.

## Package API Surface

```typescript
// Public exports from @agou/liquid-glass-core
export {
  // Factory
  GlassEngine,
  type GlassContextOptions,

  // Context
  type GlassContext,
  type BackdropSourceConfig,
  type MaterialConfig,
  type MaterialRenderData,
  type ScissorRect,

  // Interaction
  type InteractionConfig,
  type InteractionState,
  type InteractionOutput,
  type PointerState,
  type PresetType,
  InteractionPresets,

  // Events
  TypedEventEmitter,
  type GlassEventMap,
  type GlassEvent,

  // Types
  type RenderMode,
  type ViewportMode,
  type FallbackMode,
  type TextureDirtyReason,
  type MaterialFeedback,

  // Utilities
  detectFeatures,
  computeCumulativeOpacity,
  generateUUID,
} from '@agou/liquid-glass-core';
```

**IMPORTANT:** All code in this package must include thorough comments. Every exported function, class, interface, and type must have JSDoc/TSDoc documentation. Complex internal logic must have inline comments explaining the reasoning behind the implementation.
