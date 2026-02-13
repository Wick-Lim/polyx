# PolyX - Claude Code Guide

## Project Overview

PolyX is a JSX-to-Custom Elements compiler. It transforms JSX components into native Web Components (Custom Elements) at build time, providing React-like DX without a virtual DOM.

## Architecture

```
packages/
├── core/        # Shared types (PolyXComponent, ComponentInstance, CompilerOptions, TransformResult) and constants (POLYX_TAG_PREFIX, HOOK_TYPES, JSX_PRAGMA)
├── compiler/    # Babel-based JSX → Custom Element class transformation, scoped CSS, fine-grained reactivity
├── runtime/     # PolyXElement base class, hooks, context API, error boundaries, hydration, reconciliation, HMR
├── ssr/         # Server-side rendering: renderToString, renderPage, virtual DOM (VNode/VTextNode/VCommentNode)
└── vite-plugin/ # Vite integration (enforce: 'pre', esbuild.jsx = 'preserve', HMR injection)

examples/
├── counter/         # Basic counter with App, Counter, Test components
├── todo/            # Todo app: list rendering, useCallback, useMemo, filter state
├── theme-context/   # Context API demo: createContext, useContext, theme/locale switching
└── async-dashboard/ # Async data loading, error boundaries, memoized filtering, scoped CSS
```

**Dependency flow:** `core` ← `compiler` ← `vite-plugin`, `core` ← `runtime`, `core` ← `compiler` ← `ssr`

## Monorepo

- **npm workspaces** — no Lerna/Turborepo/Nx
- Root `package.json` defines workspaces: `packages/*`, `examples/*`

## Key Technical Concepts

### Compilation Pipeline
1. Babel parses JSX/TSX into AST
2. Finds functions starting with capital letter containing JSX
3. Extracts `useState` → transforms to `this._state` access with getters/setters
4. Converts JSX return → static HTML template + dynamic markers
5. Generates per-state `_renderState_{name}()` methods for fine-grained reactivity (skipped when derived hooks are used)
6. Extracts and scopes `<style>` tags with auto-generated `data-{hash}` attributes
7. Wraps body in `_render()` method on a class extending `PolyXElement`
8. Registers via `customElements.define('polyx-{name}', ...)`

### Dynamic Binding Markers

| Marker | Purpose |
|--------|---------|
| `data-dyn="{idx}"` | Dynamic text/node value (replaced with comment node at mount) |
| `data-px-el="{idx}"` | Unified element marker for dynamic attrs, events, spreads, and child components |
| `data-polyx-hydrate` | SSR hydration marker |

**Legacy markers** (still supported by runtime for backward compat): `data-attr-{name}`, `data-event-{event}`, `data-spread`, `data-child-idx`

### Component Naming
`FunctionName` → `polyx-{functionname}` custom element tag (prefix from `POLYX_TAG_PREFIX`)

## Build, Dev & Test

```bash
npm install              # Install all workspaces
npm run build            # tsc build all packages
npm run dev              # tsc --watch all packages
npm test                 # vitest run
npm run test:watch       # vitest (watch mode)
npm run test:coverage    # vitest run --coverage

# Example
cd examples/counter
npm run dev              # Vite dev server at localhost:5173
```

### Testing

- **Framework:** Vitest with happy-dom environment
- **Config:** `vitest.config.ts` at root
- **Test location:** `packages/*/src/__tests__/**/*.test.ts`
- **Coverage:** v8 provider, excludes test files and index.ts re-exports

Test suites:
- `packages/compiler/src/__tests__/compiler.test.ts` — compilation transforms
- `packages/runtime/src/__tests__/component.test.ts` — PolyXElement behavior
- `packages/runtime/src/__tests__/hooks.test.ts` — hooks (useState, useEffect, etc.)

## TypeScript Config

All packages: `ES2022` target, `ESNext` modules, `bundler` module resolution, strict mode, declarations + source maps enabled. Output to `dist/`.

## Code Conventions

- Source in TypeScript (`.ts`), components in `.jsx`/`.tsx`
- ESM only (`"type": "module"`)
- Compiler entry: `compile(code, options)` and `transform(code, id, options)`
- Runtime exports hooks from `@polyx/runtime`
- Vite plugin: `import polyx from '@polyx/vite-plugin'`

## Key APIs

### Compiler (`@polyx/compiler`)
- `compile(code, options?)` — compile JSX source to Custom Element classes
- `transform(code, id, options?)` — transform a file by ID (convenience wrapper)

### Runtime (`@polyx/runtime`)
- **Hooks:** `useState`, `useEffect`, `useLayoutEffect`, `useRef`, `useMemo`, `useCallback`
- **Context:** `createContext(defaultValue)`, `useContext(context)` (provider cached after first DOM walk)
- **Error Boundaries:** `PolyXErrorBoundary` abstract base class
- **Hydration:** `hydrate(root?)`, `isHydrating(element)`
- **HMR:** `initHMR()`, `getHMR()`
- **Reconciliation:** `reconcileChildren()` (keyed, O(n log n) LIS), `reconcileNonKeyed()` (with value-skip optimization)
- **Utilities:** `defineComponent(tagName, renderFn)`, `createTemplate(html)`, `clearTemplateCache()`

### SSR (`@polyx/ssr`)
- `registerComponent(tagName, componentClass)` — register for SSR
- `renderToString(tagName, props)` — render component to HTML string
- `renderPage(options)` — render full HTML page (title, head, scripts, body)
- Virtual DOM: `VNode`, `VTextNode`, `VCommentNode`

## Dependencies

- **Compiler:** `@babel/core`, `@babel/parser`, `@babel/traverse`, `@babel/generator`, `@babel/types` (v7.23.0)
- **Runtime:** No external dependencies (pure Web Components)
- **SSR:** `@polyx/core`, `@polyx/compiler`
- **Vite plugin:** peer dep `vite ^4.0.0 || ^5.0.0`
- **Dev (root):** `vitest`, `happy-dom`, `@vitest/coverage-v8`, `typescript`

## Runtime Internals

### PolyXElement key fields
- `_state` — component state (compiler-generated getters/setters)
- `_props` — props received from parent
- `_valueMarkers` — comment nodes for `data-dyn` text slots
- `_valueCache` — cached values for skip-unchanged optimization
- `_elements` — unified element array indexed by `data-px-el` marker idx
- `_arrayChildren` / `_arrayValues` — list reconciliation tracking

### Performance optimizations
- **Value caching:** `_setDynamicValue` skips unchanged primitives via reference equality; text updates use `textContent` fast path
- **Unified element refs:** single `data-px-el` marker → direct array index instead of Map<string> lookups
- **Context caching:** `useContext` caches provider ref after first DOM walk; no traversal on re-renders
- **Conditional effects:** `queueMicrotask` only scheduled when effects are pending
- **O(n log n) LIS:** keyed reconciliation uses patience sorting with binary search
- **Non-keyed skip:** `reconcileNonKeyed` skips `createElement` when old/new values match by reference

## Current Status (v0.1.0)

**Working:** JSX compilation, all hooks (useState/useEffect/useLayoutEffect/useRef/useMemo/useCallback), context API (createContext/useContext), error boundaries, event handling, conditional rendering, list rendering with reconciliation, dynamic text/attributes/spread, scoped CSS, fine-grained reactivity, children & fragment support, void element handling, template caching, SSR (renderToString/renderPage), hydration, Vite HMR

**Roadmap:** Slot composition patterns, SSR streaming, production SSR integration
