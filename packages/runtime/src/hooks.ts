import { assertCurrentInstance, getNextHookIndex, setCurrentInstance, getCurrentInstance } from './hooks-internals.js';
import type { ComponentInstance, HookEffect } from '@polyx/core';

// Bug fix 1.3: Proper deps comparison with length check
function depsChanged(prevDeps: any[] | undefined, nextDeps: any[] | undefined): boolean {
  if (!prevDeps || !nextDeps) return true;
  if (prevDeps.length !== nextDeps.length) return true;
  return nextDeps.some((dep, i) => dep !== prevDeps[i]);
}

export function useState<T>(initialState: T): [T, (updater: T | ((prev: T) => T)) => void] {
  const instance = assertCurrentInstance();
  const index = getNextHookIndex();

  if (instance.hooks.length <= index) {
    instance.hooks.push(initialState);
  }

  const state = instance.hooks[index];

  const setState = (updater: T | ((prev: T) => T)) => {
    const newState = typeof updater === 'function'
      ? (updater as (prev: T) => T)(instance.hooks[index])
      : updater;

    if (newState !== instance.hooks[index]) {
      instance.hooks[index] = newState;
      // Trigger re-render
      instance.render();
    }
  };

  return [state, setState];
}

export function useEffect(callback: () => void | (() => void), deps?: any[]): void {
  const instance = assertCurrentInstance();
  const index = getNextHookIndex();

  if (instance.hooks.length <= index) {
    instance.hooks.push({ callback, deps, cleanup: undefined });
    instance.effects.push({ callback, deps });
  } else {
    const prevHook = instance.hooks[index];
    const hasChanged = depsChanged(prevHook.deps, deps);

    if (hasChanged) {
      instance.hooks[index] = { callback, deps, cleanup: prevHook.cleanup };
      instance.effects.push({ callback, deps });
    }
  }
}

export function useLayoutEffect(callback: () => void | (() => void), deps?: any[]): void {
  const instance = assertCurrentInstance();
  const index = getNextHookIndex();

  if (instance.hooks.length <= index) {
    instance.hooks.push({ callback, deps, cleanup: undefined });
    instance.layoutEffects.push({ callback, deps });
  } else {
    const prevHook = instance.hooks[index];
    const hasChanged = depsChanged(prevHook.deps, deps);

    if (hasChanged) {
      instance.hooks[index] = { callback, deps, cleanup: prevHook.cleanup };
      instance.layoutEffects.push({ callback, deps });
    }
  }
}

export function useRef<T>(initialValue: T): { current: T } {
  const instance = assertCurrentInstance();
  const index = getNextHookIndex();

  if (instance.hooks.length <= index) {
    instance.hooks.push({ current: initialValue });
  }

  return instance.hooks[index];
}

export function useMemo<T>(factory: () => T, deps: any[]): T {
  const instance = assertCurrentInstance();
  const index = getNextHookIndex();

  if (instance.hooks.length <= index) {
    const value = factory();
    instance.hooks.push({ value, deps });
    return value;
  }

  const hook = instance.hooks[index];
  const hasChanged = depsChanged(hook.deps, deps);

  if (hasChanged) {
    hook.value = factory();
    hook.deps = deps;
  }

  return hook.value;
}

export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T {
  return useMemo(() => callback, deps);
}

export { getCurrentInstance, setCurrentInstance } from './hooks-internals.js';
