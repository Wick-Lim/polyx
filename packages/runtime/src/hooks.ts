import { assertCurrentInstance, getNextHookIndex, setCurrentInstance, getCurrentInstance, getNextId } from './hooks-internals.js';
import { startTransitionWithCallback, scheduleTransition } from './scheduler.js';
import type { ComponentInstance, HookEffect } from '@polyx/core';

// Bug fix 1.3: Proper deps comparison with length check
export function depsChanged(prevDeps: any[] | undefined, nextDeps: any[] | undefined): boolean {
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

export function useTransition(): [boolean, (callback: () => void) => void] {
  const instance = assertCurrentInstance();
  const index = getNextHookIndex();

  if (instance.hooks.length <= index) {
    const hook = { isPending: false, startTransition: null as any };
    hook.startTransition = (callback: () => void) => {
      hook.isPending = true;
      instance.render(); // sync re-render → isPending=true reflected
      startTransitionWithCallback(callback, () => {
        hook.isPending = false;
        instance.render(); // transition complete → isPending=false
      });
    };
    instance.hooks.push(hook);
  }

  const hook = instance.hooks[index];
  return [hook.isPending, hook.startTransition];
}

export function useDeferredValue<T>(value: T): T {
  const instance = assertCurrentInstance();
  const index = getNextHookIndex();

  if (instance.hooks.length <= index) {
    instance.hooks.push({ currentValue: value, deferredValue: value, pendingUpdate: false });
    return value;
  }

  const hook = instance.hooks[index];
  if (!Object.is(hook.currentValue, value)) {
    hook.currentValue = value;
    if (!hook.pendingUpdate) {
      hook.pendingUpdate = true;
      scheduleTransition(() => {
        hook.pendingUpdate = false;
        if (!Object.is(hook.deferredValue, hook.currentValue)) {
          hook.deferredValue = hook.currentValue;
          instance.render();
        }
      });
    }
  }
  return hook.deferredValue;
}

export function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initialArg: S,
  init?: (arg: S) => S
): [S, (action: A) => void] {
  const instance = assertCurrentInstance();
  const index = getNextHookIndex();

  if (instance.hooks.length <= index) {
    const initialState = init ? init(initialArg) : initialArg;
    instance.hooks.push(initialState);
  }

  const state = instance.hooks[index];

  const dispatch = (action: A) => {
    const currentState = instance.hooks[index];
    const newState = reducer(currentState, action);
    if (!Object.is(newState, currentState)) {
      instance.hooks[index] = newState;
      instance.render();
    }
  };

  return [state, dispatch];
}

export function useId(): string {
  const instance = assertCurrentInstance();
  const index = getNextHookIndex();

  if (instance.hooks.length <= index) {
    instance.hooks.push(getNextId());
  }

  return instance.hooks[index];
}

export { getCurrentInstance, setCurrentInstance } from './hooks-internals.js';
export { resetIdCounter } from './hooks-internals.js';
