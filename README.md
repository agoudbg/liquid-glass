# 🌊 Liquid Glass

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5+-brightgreen?logo=vue.js" alt="Vue 3" />
  <img src="https://img.shields.io/badge/TypeScript-5.6+-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/WebGL2-Powered-orange?logo=webgl" alt="WebGL2" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

A Vue 3 component library for creating stunning **iOS-style Liquid Glass** effects using WebGL. Provides physically-based refraction, distortion, and interactive touch animations that bring the fluidity and elegance of Apple's glass design language to the web.

## 🧠 How It Works

- **Backdrop capture**: `LgBackdropConverter` and `LgBackdropCanvas` register with `LiquidRendererManager`, which captures DOM/canvas content into a texture.
- **Material registration**: Each `LiquidGlassMaterial` registers a material element that tracks layout, visibility, and interaction transforms.
- **Render pipeline**: The manager keeps a RAF loop that recalculates layout, renders backdrops, runs WebGL passes, and composites into a single uniform canvas.
- **Nested glass**: Child `LiquidGlass` instances expose a composite canvas to their parent via `LiquidRendererBackdropElement`, so parents can refract child stacks without double-capturing the DOM.
- **Fallback**: When WebGL is unavailable or disabled, materials switch to CSS `backdrop-filter` while keeping layout/interaction logic intact.

## ✨ Features

- 🔮 **Real-time Refraction** - WebGL2-powered pixel displacement with configurable index of refraction
- 🌈 **Chromatic Dispersion** - Optional rainbow edge effects simulating light separation
- 🎯 **Interactive Touch Effects** - Physics-based press/drag animations with elastic rebound
- 🌓 **Automatic Theme Detection** - Detects underlying backdrop brightness for light/dark mode
- 📦 **Vue 3 Components** - Declarative API with full TypeScript support
- ⚡ **High Performance** - Optimized rendering pipeline with throttling and caching
- 🔄 **Nested Glass Support** - Stack multiple glass layers with proper compositing
- 🎨 **Customizable** - Fine-tune thickness, blur, corner radii, and more

## 📦 Installation

```bash
# Using pnpm (recommended)
pnpm add @agou/liquid-glass

# Using npm
npm install @agou/liquid-glass

# Using yarn
yarn add @agou/liquid-glass
```

### Peer Dependencies

This library requires Vue 3 as a peer dependency:

```bash
pnpm add vue@^3.5
```

## 🚀 Quick Start

### Basic Usage

```vue
<template>
  <LiquidGlass>
    <!-- Background content that will be refracted -->
    <LgBackdropConverter>
      <div class="background">
        <img src="/background.jpg" alt="Background" />
      </div>
    </LgBackdropConverter>

    <!-- Glass material element -->
    <LiquidGlassMaterial :radius="24" :thickness="20">
      <div class="glass-card">
        <h3>Hello, Glass!</h3>
        <p>This content floats on liquid glass</p>
      </div>
    </LiquidGlassMaterial>
  </LiquidGlass>
</template>

<script setup lang="ts">
import {
  LiquidGlass,
  LgBackdropConverter,
  LiquidGlassMaterial,
} from '@agou/liquid-glass';
</script>
```

## 📚 Components

### `<LiquidGlass>`

The main container component that provides the rendering context for glass effects.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `scrollable` | `boolean` | `false` | Enable scroll handling for content |
| `renderPrecision` | `number` | `0` (auto) | Render scale factor (0.5-2.0) |
| `renderMode` | `'uniform' \| 'dedicated'` | `'uniform'` | Canvas strategy. `dedicated` is currently unimplemented (see Known Limitations). |
| `enableBlurredEffect` | `boolean` | `false` | Hide border/shadow when page loses focus |
| `debug` | `boolean` | `false` | Enable debug logging |
| `themeColorThresholds` | `object` | - | Custom theme detection thresholds |

### `<LiquidGlassMaterial>`

Individual glass material with refraction and interaction effects.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `radius` | `number` | **Required** | Corner radius in pixels |
| `radiusTR/BR/BL/TL` | `number` | - | Individual corner radii |
| `thickness` | `number` | `20` | Glass thickness (affects refraction) |
| `refractIndex` | `number` | `1.5` | Index of refraction (glass ≈ 1.5) |
| `refractIntensity` | `number` | `1.0` | Refraction strength multiplier |
| `dispersion` | `number` | `0` | Chromatic aberration (0-0.05) |
| `blur` | `number` | `0` | Background blur amount |
| `disableInteractions` | `boolean` | `false` | Disable touch/pointer effects |
| `onlyClickInteractions` | `boolean` | `false` | Only allow click, no drag |
| `colorDebounceMs` | `number` | `200` | Theme color update debounce |
| `zIndex` | `number` | - | Custom z-index |

**Slot Props:**

```vue
<LiquidGlassMaterial :radius="20" v-slot="{ updating, startUpdating, stopUpdating }">
  <!-- updating: boolean - whether material is animating -->
  <!-- startUpdating: () => void - force render update -->
  <!-- stopUpdating: () => void - pause render updates -->
</LiquidGlassMaterial>
```

**Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `backgroundColorChange` | `'light' \| 'dark' \| 'ultra_light' \| 'ultra_dark'` | Theme mode changed |

### `<LgBackdropConverter>`

Converts DOM content to a canvas texture for refraction effects.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `zIndex` | `number` | - | Stacking order |
| `watchResize` | `boolean` | `true` | Re-capture on resize |
| `watchNodeChanges` | `boolean` | `true` | Re-capture on DOM mutations |

### `<LgBackdropCanvas>`

For custom canvas drawing as backdrop content.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `draw` | `(ctx, w, h) => void` | - | Custom draw callback |
| `zIndex` | `number` | - | Stacking order |

## 🎮 Advanced Usage

### Scrollable Content

```vue
<LiquidGlass :scrollable="true">
  <LgBackdropConverter>
    <div class="long-content">
      <!-- Scrollable content here -->
    </div>
  </LgBackdropConverter>

  <LiquidGlassMaterial :radius="20" style="position: sticky; top: 0;">
    <nav>Sticky Glass Navigation</nav>
  </LiquidGlassMaterial>
</LiquidGlass>
```

### Nested Glass Layers

```vue
<LiquidGlass>
  <LgBackdropConverter>
    <div class="background">...</div>
  </LgBackdropConverter>

  <LiquidGlassMaterial :radius="24">
    <div class="outer-glass">
      <!-- Nested LiquidGlass for inner glass -->
      <LiquidGlass>
        <LiquidGlassMaterial :radius="12">
          <div class="inner-glass">Nested!</div>
        </LiquidGlassMaterial>
      </LiquidGlass>
    </div>
  </LiquidGlassMaterial>
</LiquidGlass>
```

### Custom Chromatic Dispersion

```vue
<LiquidGlassMaterial
  :radius="30"
  :thickness="25"
  :refract-index="1.6"
  :dispersion="0.03"
>
  <div class="rainbow-edge-card">
    Rainbow edges! ✨
  </div>
</LiquidGlassMaterial>
```

### Theme-Aware Content

```vue
<LiquidGlassMaterial
  :radius="20"
  @background-color-change="onThemeChange"
>
  <div :class="['content', themeClass]">
    Auto-adapting content
  </div>
</LiquidGlassMaterial>

<script setup>
const themeClass = ref('light');
const onThemeChange = (mode) => {
  themeClass.value = mode.includes('dark') ? 'dark' : 'light';
};
</script>
```

## 🎨 Styling

### CSS Variables

The component exposes several CSS classes you can style:

```css
.liquid-glass-container {
  /* Main container */
}

.liquid-glass-material {
  /* Individual glass material */
}

.liquid-glass-highlight {
  /* Touch highlight effect */
}
```

### Fallback Mode

When WebGL is unavailable, the library automatically falls back to CSS `backdrop-filter`:

```css
.liquid-glass-material[is-fallback-mode="true"] {
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
```

## ⚡ Performance Tips

1. **Use `enableBlurredEffect`** to hide decorative elements when page loses focus
2. **Lower `renderPrecision`** (0.5-0.8) for complex scenes
3. **Limit the number of `LiquidGlassMaterial`** components on screen
4. **Use `watchNodeChanges: false`** when backdrop content is static
5. **Prefer `LgBackdropCanvas`** over `LgBackdropConverter` for animated content

## 🧪 Development

```bash
# Install dependencies
pnpm install

# Start dev server with demos
pnpm dev

# Build library
pnpm build

# Build demo site
pnpm build:demo

# Type check
pnpm type-check

# Lint
pnpm lint
```

## 📁 Project Structure

```
src/
├── components/           # Vue components
│   ├── LiquidGlass.vue           # Main container
│   ├── LiquidGlassMaterial.vue   # Glass material
│   ├── LgBackdropConverter.vue   # DOM-to-canvas
│   ├── LgBackdropCanvas.vue      # Custom canvas
│   └── LiquidGlassDebugger.vue   # Debug overlay
├── core/                 # Core rendering engine
│   ├── liquidGlassRenderer.ts    # WebGL renderer factory
│   ├── LiquidRendererManager.ts  # Render pipeline coordinator
│   └── ...
├── shaders/              # GLSL shaders
│   ├── LiquidGlass.vert          # Vertex shader
│   └── LiquidGlassAdvanced.frag  # Fragment shader
├── composables/          # Vue composables
├── types/                # TypeScript definitions
└── demo/                 # Demo components
```

### File Notes

- [src/components/LiquidGlass.vue](src/components/LiquidGlass.vue): Sets up the container, owns the uniform canvas, and wires `LiquidRendererManager` plus nested context/depth providers. In uniform mode it mirrors the manager's offscreen canvas into the DOM canvas.
- [src/core/LiquidRendererManager.ts](src/core/LiquidRendererManager.ts): Central orchestrator. Handles layout tracking, backdrop capture throttling, RAF-driven updates, and nested compositing. `renderMode` is defined here but the `dedicated` branch is stubbed.
- [src/components/LiquidGlassMaterial.vue](src/components/LiquidGlassMaterial.vue): Registers materials, handles interaction physics, and forwards transforms to the manager. Applies depth-aware z-index only when in uniform mode.
- [src/composables/useExternalRenderer.ts](src/composables/useExternalRenderer.ts): Supports cross-component render delegation so materials can be rendered by a different `LiquidGlass` instance.

## 🙏 Acknowledgments

- Inspired by iOS Liquid Glass design language
- Reference implementation from [Telegram Android](https://github.com/AgoufGit/tAndroidReference)
- Shader techniques from [@Muggleee/liquid-glass](https://github.com/Muggleee/liquid-glass)

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## ⚠️ Known Limitations & Defects

- `renderMode: 'dedicated'` is declared but **not implemented** in [src/core/LiquidRendererManager.ts](src/core/LiquidRendererManager.ts); selecting it currently yields the uniform rendering path with no per-material canvases. Keep to `uniform` until the dedicated pipeline is completed.
- Documentation for the planned dedicated mode is pending; samples and API tables currently reflect uniform mode behavior only.

---

<p align="center">
  Made with ❤️ for beautiful web interfaces
</p>