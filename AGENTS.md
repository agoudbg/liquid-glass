# AGENTS.md — Liquid Glass Rewrite

## Project Overview

Cross-framework WebGL2 liquid glass effect library. Provides a physically-based screen-space refraction shader that simulates glass materials over arbitrary DOM content. Monorepo managed by pnpm.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript with strict mode enabled |
| Build | Vite 6 (library mode) with `vite-plugin-dts` |
| Package Manager | pnpm (workspaces) |
| Lint | ESLint 9 (flat config) with `@typescript-eslint` and `simple-import-sort` |
| Test | Vitest (unit + browser mode) |
| Rendering | WebGL2 (raw, no Three.js dependency in core) |
| DOM Capture | `html-to-image` (primary), `html2canvas` (optional fallback) |
| CSS | Framework-specific (CSS custom properties, CSS Modules, scoped styles) |

## Package Structure

```
packages/
├── core/        @agou/liquid-glass-core       Pure TypeScript, zero framework deps
├── vue/         @agou/liquid-glass-vue        Vue 3 adapter (Composition API, <script setup>)
├── react/       @agou/liquid-glass-react      React 19 adapter (Functional Components, Hooks)
└── solid/       @agou/liquid-glass-solid      Solid adapter (Components, Primitives)

apps/
├── playground/  Dev playground with all framework demos (Vite)
└── storybook/   Interactive component testing + visual regression (Chromatic)
```

## Architecture

```
Framework Adapters (Vue, React, Solid)
        │
        ▼
┌──────────────────────┐
│  @agou/liquid-glass  │
│       -core          │  ← Pure TypeScript, zero framework dependencies
│                      │
│  ┌────────────────┐  │
│  │  GlassEngine   │  │  ← Top-level orchestrator: RAF loop, lifecycle, mode mgmt
│  └───────┬────────┘  │
│          │            │
│  ┌───────┼────────┐  │
│  │       │        │  │
│  ▼       ▼        ▼  │
│ WebGL   Backdrop  Interaction
│ Render  Capture   Engine
└──────────────────────┘
```

### Core Engine Modules

| Module | Responsibility |
|---|---|
| `types/` | Shared interfaces, enums, event maps |
| `events/TypedEventEmitter.ts` | Generic type-safe pub/sub event system |
| `utils/` | Pure utilities: feature detection, UUID, opacity calculation |
| `shaders/` | GLSL vertex and fragment shader source code |
| `renderer/` | WebGL2 context creation, shader compilation, texture management, uniform binding, draw calls |
| `interaction/` | Spring physics engine, CSS transform matrix parsing, interaction presets |
| `backdrop/` | DOM-to-canvas capture via html-to-image, backdrop element tracking, compositing |
| `engine/` | Orchestrator: GlassContext (per-container), MaterialManager, BackdropManager, ViewportAdapter, CompositePipeline |

### Framework Adapter Responsibilities

Each framework adapter is a **thin wrapper** (target: 300-500 lines per component) that:
1. Instantiates a `GlassContext` from core
2. Manages DOM element refs and passes them to core
3. Wires framework-specific lifecycle (mount/unmount/update) to core API calls
4. Handles pointer events and translates them to `InteractionState`
5. Applies CSS visual effects via framework-idiomatic styling

## Development Rules

### Golden Rules
1. **No framework code in core.** Core must never import from vue/react/solid/svelte. DOM APIs are allowed (no alternative).
2. **No logic changes from reference code.** Shader GLSL and physics math must match the reference implementation byte-for-byte. See `.plan/reference/src/` for the original implementation.
3. **Test before extract.** When extracting logic from reference code, write a test first that captures the current behavior, then extract the code and verify the test passes.
4. **Comments in English.** All code comments must be in English. Focus on "why" not "what".
5. **No `any` type.** Use `unknown` or proper generics. The only exception is event handler parameters in TypedEventEmitter (inherently dynamic).
6. **Single Responsibility.** No file shall exceed 500 lines. If a file approaches 400 lines, plan to split it.
7. **Comments must be thorough.** Every exported function, class, interface, and type must have JSDoc/TSDoc comments. Complex internal logic must have inline comments explaining the "why".

### Code Style
- Follow existing patterns in reference code for naming conventions
- Use `camelCase` for variables and functions, `PascalCase` for classes and interfaces
- No underscore-prefixed private members
- Prefer `interface` over `type` for object shapes
- Use explicit return types on public API functions

### Commit Style
Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code restructuring without behavior change
- `test:` — Adding or modifying tests
- `docs:` — Documentation only
- `chore:` — Build, CI, tooling

## Verification Checklist

Run after every phase. All must pass before marking a phase complete:

```bash
pnpm -r typecheck    # 0 errors
pnpm -r lint         # 0 errors
pnpm -r test run     # 100% pass
pnpm -r build        # All packages build successfully
```

## Common Commands

```bash
# Install all workspace dependencies
pnpm install

# Type-check all packages
pnpm -r typecheck

# Lint all packages
pnpm -r lint

# Run all tests
pnpm -r test run

# Run tests in watch mode
pnpm -r test

# Build all packages
pnpm -r build

# Start playground dev server
pnpm dev
```

## Reference Code Location

The original implementation is preserved at `.plan/reference/src/`. **This directory is gitignored and will never be committed.** When implementing any module, open the corresponding reference file side by side to ensure behavioral parity.
