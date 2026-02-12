# PolyX - Claude Code Guide

## Project Overview

PolyX is a JSX-to-Custom Elements compiler. It transforms JSX components into native Web Components (Custom Elements) at build time, providing React-like DX without a virtual DOM.

## Architecture

```
packages/
├── core/        # Shared types (PolyXComponent, ComponentInstance, HookEffect) and constants (POLYX_TAG_PREFIX, HOOK_TYPES, JSX_PRAGMA)
├── compiler/    # Babel-based JSX → Custom Element class transformation
├── runtime/     # PolyXElement base class, hooks (useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect)
└── vite-plugin/ # Vite integration (enforce: 'pre', esbuild.jsx = 'preserve')

examples/
└── counter/     # Demo app with App, Counter, Test components
```

**Dependency flow:** `core` ← `compiler` ← `vite-plugin`, `core` ← `runtime`

## Monorepo

- **npm workspaces** — no Lerna/Turborepo/Nx
- Root `package.json` defines workspaces: `packages/*`, `examples/*`

## Key Technical Concepts

### Compilation Pipeline
1. Babel parses JSX/TSX into AST
2. Finds functions starting with capital letter containing JSX
3. Extracts `useState` → transforms to `this._state` access with getters/setters
4. Converts JSX return → static HTML template + dynamic markers
5. Wraps body in `_render()` method on a class extending `PolyXElement`
6. Registers via `customElements.define('polyx-{name}', ...)`

### Dynamic Binding Markers
- `<span data-dyn="{index}">` — dynamic text/node values
- `data-attr-{name}="{index}"` — dynamic attributes
- `data-event-{event}="{index}"` — event listeners

### Component Naming
`FunctionName` → `polyx-{functionname}` custom element tag (prefix from `POLYX_TAG_PREFIX`)

## Build & Dev

```bash
npm install          # Install all workspaces
npm run build        # tsc build all packages
npm run dev          # tsc --watch all packages

# Example
cd examples/counter
npm run dev          # Vite dev server at localhost:5173
```

## TypeScript Config

All packages: `ES2022` target, `ESNext` modules, `bundler` module resolution, strict mode, declarations + source maps enabled. Output to `dist/`.

## Code Conventions

- Source in TypeScript (`.ts`), components in `.jsx`/`.tsx`
- ESM only (`"type": "module"`)
- Compiler entry: `compile(code, options)` and `transform(code, id, options)`
- Runtime exports hooks from `@polyx/runtime`
- Vite plugin: `import polyx from '@polyx/vite-plugin'`

## Dependencies

- **Compiler:** `@babel/core`, `@babel/parser`, `@babel/traverse`, `@babel/generator`, `@babel/types` (v7.23.0)
- **Runtime:** No external dependencies (pure Web Components)
- **Vite plugin:** peer dep `vite ^4.0.0 || ^5.0.0`

## Current Status (v0.1.0)

**Working:** JSX compilation, useState/useEffect/useLayoutEffect/useRef/useMemo/useCallback, event handling, conditional rendering, dynamic text/attributes, template caching, Vite HMR

**Roadmap:** Fine-grained reactivity, scoped CSS, complex props (object/function), slot & children, SSR & hydration
