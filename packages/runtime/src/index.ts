// Template-based runtime exports
export { PolyXElement, defineComponent, createTemplate, clearTemplateCache } from './component.js';
export type { RenderFn } from './component.js';
export { reconcileChildren, reconcileNonKeyed } from './reconcile.js';
export { createContext, useContext } from './context.js';
export type { PolyXContext } from './context.js';
export { PolyXErrorBoundary } from './error-boundary.js';
export type { ErrorInfo } from './error-boundary.js';

// HMR support
export { initHMR, getHMR } from './hmr.js';

// Hydration support
export { hydrate, isHydrating } from './hydrate.js';

// Priority scheduling
export { startTransition, shouldYield, scheduleIdle, startIdle } from './scheduler.js';

// Suspense + lazy
export { lazy, PolyXSuspense } from './suspense.js';

// Portal
export { PolyXPortal, createPortal } from './portal.js';

// DevTools
export { initDevTools, getDevTools } from './devtools.js';
export type { ComponentDebugInfo, ProfilingResult } from './devtools.js';

// Hooks
export {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  useTransition,
  useDeferredValue,
  useReducer,
  useId,
  resetIdCounter,
} from './hooks.js';
