import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from '../hooks.js';
import { setCurrentInstance, getCurrentInstance, getCurrentHookIndex, getNextHookIndex } from '../hooks-internals.js';
import type { ComponentInstance } from '@polyx/core';

function createMockInstance(): ComponentInstance {
  return {
    hooks: [],
    hookIndex: 0,
    effects: [],
    layoutEffects: [],
    element: document.createElement('div'),
    render: vi.fn(),
  };
}

function withInstance<T>(instance: ComponentInstance, fn: () => T): T {
  setCurrentInstance(instance);
  instance.hookIndex = 0;
  try {
    return fn();
  } finally {
    setCurrentInstance(null);
  }
}

describe('useState', () => {
  it('should return initial state and setter', () => {
    const instance = createMockInstance();
    const [state, setState] = withInstance(instance, () => useState(42));
    expect(state).toBe(42);
    expect(typeof setState).toBe('function');
  });

  it('should persist state across renders', () => {
    const instance = createMockInstance();

    // First render
    const [state1] = withInstance(instance, () => useState(42));
    expect(state1).toBe(42);

    // Second render
    const [state2] = withInstance(instance, () => useState(42));
    expect(state2).toBe(42);
  });

  it('should update state with a value', () => {
    const instance = createMockInstance();

    const [, setState] = withInstance(instance, () => useState(0));
    setState(5);

    // After set, hooks array should be updated
    expect(instance.hooks[0]).toBe(5);
    expect(instance.render).toHaveBeenCalled();
  });

  it('should update state with a function updater', () => {
    const instance = createMockInstance();

    const [, setState] = withInstance(instance, () => useState(10));
    setState((prev: number) => prev + 5);

    expect(instance.hooks[0]).toBe(15);
  });

  it('should not trigger render if state unchanged', () => {
    const instance = createMockInstance();

    const [, setState] = withInstance(instance, () => useState(42));
    setState(42);

    expect(instance.render).not.toHaveBeenCalled();
  });
});

describe('useEffect', () => {
  it('should queue effect on first render', () => {
    const instance = createMockInstance();
    const callback = vi.fn();

    withInstance(instance, () => useEffect(callback, []));

    expect(instance.effects).toHaveLength(1);
    expect(instance.effects[0].callback).toBe(callback);
  });

  it('should not re-queue effect when deps unchanged', () => {
    const instance = createMockInstance();
    const callback = vi.fn();

    // First render
    withInstance(instance, () => useEffect(callback, [1, 2]));
    expect(instance.effects).toHaveLength(1);
    instance.effects = [];

    // Second render, same deps
    withInstance(instance, () => useEffect(callback, [1, 2]));
    expect(instance.effects).toHaveLength(0);
  });

  it('should re-queue effect when deps change', () => {
    const instance = createMockInstance();
    const callback = vi.fn();

    // First render
    withInstance(instance, () => useEffect(callback, [1]));
    instance.effects = [];

    // Second render, different deps
    withInstance(instance, () => useEffect(callback, [2]));
    expect(instance.effects).toHaveLength(1);
  });

  it('should always re-queue effect when no deps provided', () => {
    const instance = createMockInstance();
    const callback = vi.fn();

    // First render
    withInstance(instance, () => useEffect(callback));
    instance.effects = [];

    // Second render
    withInstance(instance, () => useEffect(callback));
    expect(instance.effects).toHaveLength(1);
  });

  // Bug fix 1.3 regression test: deps length change detection
  it('should detect deps array length changes', () => {
    const instance = createMockInstance();
    const callback = vi.fn();

    // First render with 2 deps
    withInstance(instance, () => useEffect(callback, [1, 2]));
    instance.effects = [];

    // Second render with 3 deps (length changed)
    withInstance(instance, () => useEffect(callback, [1, 2, 3]));
    expect(instance.effects).toHaveLength(1);
  });
});

describe('useLayoutEffect', () => {
  it('should queue layout effect', () => {
    const instance = createMockInstance();
    const callback = vi.fn();

    withInstance(instance, () => useLayoutEffect(callback, []));

    expect(instance.layoutEffects).toHaveLength(1);
  });

  it('should detect deps length changes', () => {
    const instance = createMockInstance();
    const callback = vi.fn();

    withInstance(instance, () => useLayoutEffect(callback, [1]));
    instance.layoutEffects = [];

    withInstance(instance, () => useLayoutEffect(callback, [1, 2]));
    expect(instance.layoutEffects).toHaveLength(1);
  });
});

describe('useRef', () => {
  it('should return ref object with initial value', () => {
    const instance = createMockInstance();

    const ref = withInstance(instance, () => useRef(42));

    expect(ref).toEqual({ current: 42 });
  });

  it('should persist ref across renders', () => {
    const instance = createMockInstance();

    const ref1 = withInstance(instance, () => useRef(0));
    ref1.current = 99;

    const ref2 = withInstance(instance, () => useRef(0));
    expect(ref2.current).toBe(99);
    expect(ref1).toBe(ref2);
  });
});

describe('useMemo', () => {
  it('should compute and return memoized value', () => {
    const instance = createMockInstance();
    const factory = vi.fn(() => 42);

    const value = withInstance(instance, () => useMemo(factory, [1]));

    expect(value).toBe(42);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('should not recompute when deps unchanged', () => {
    const instance = createMockInstance();
    const factory = vi.fn(() => 42);

    withInstance(instance, () => useMemo(factory, [1]));
    const value2 = withInstance(instance, () => useMemo(factory, [1]));

    expect(value2).toBe(42);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('should recompute when deps change', () => {
    const instance = createMockInstance();
    let counter = 0;
    const factory = vi.fn(() => ++counter);

    withInstance(instance, () => useMemo(factory, [1]));
    const value2 = withInstance(instance, () => useMemo(factory, [2]));

    expect(value2).toBe(2);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  // Bug fix 1.3 regression test
  it('should recompute when deps length changes', () => {
    const instance = createMockInstance();
    let counter = 0;
    const factory = vi.fn(() => ++counter);

    withInstance(instance, () => useMemo(factory, [1]));
    const value2 = withInstance(instance, () => useMemo(factory, [1, 2]));

    expect(value2).toBe(2);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe('useCallback', () => {
  it('should return memoized callback', () => {
    const instance = createMockInstance();
    const fn = () => {};

    const cb1 = withInstance(instance, () => useCallback(fn, [1]));
    const cb2 = withInstance(instance, () => useCallback(fn, [1]));

    expect(cb1).toBe(cb2);
  });

  it('should return new callback when deps change', () => {
    const instance = createMockInstance();
    const fn1 = () => 'a';
    const fn2 = () => 'b';

    const cb1 = withInstance(instance, () => useCallback(fn1, [1]));
    const cb2 = withInstance(instance, () => useCallback(fn2, [2]));

    expect(cb2).not.toBe(cb1);
  });
});

describe('hooks without instance', () => {
  it('should throw when useState called without instance', () => {
    expect(() => useState(0)).toThrow('Hooks can only be called inside a component');
  });

  it('should throw when useEffect called without instance', () => {
    expect(() => useEffect(() => {}, [])).toThrow('Hooks can only be called inside a component');
  });
});

describe('getCurrentInstance', () => {
  it('should return null when no instance is set', () => {
    setCurrentInstance(null);
    expect(getCurrentInstance()).toBeNull();
  });

  it('should return the current instance after setCurrentInstance', () => {
    const instance = createMockInstance();
    setCurrentInstance(instance);
    expect(getCurrentInstance()).toBe(instance);
    setCurrentInstance(null);
  });

  it('should return null after instance is cleared', () => {
    const instance = createMockInstance();
    setCurrentInstance(instance);
    setCurrentInstance(null);
    expect(getCurrentInstance()).toBeNull();
  });
});

describe('getCurrentHookIndex', () => {
  it('should return 0 after setCurrentInstance resets the hook index', () => {
    const instance = createMockInstance();
    setCurrentInstance(instance);
    expect(getCurrentHookIndex()).toBe(0);
    setCurrentInstance(null);
  });

  it('should return the current hook index after getNextHookIndex increments', () => {
    const instance = createMockInstance();
    setCurrentInstance(instance);

    expect(getCurrentHookIndex()).toBe(0);
    getNextHookIndex(); // increments to 1
    expect(getCurrentHookIndex()).toBe(1);
    getNextHookIndex(); // increments to 2
    expect(getCurrentHookIndex()).toBe(2);

    setCurrentInstance(null);
  });

  it('should be reset to 0 when setCurrentInstance is called again', () => {
    const instance = createMockInstance();
    setCurrentInstance(instance);

    getNextHookIndex(); // 0 -> 1
    getNextHookIndex(); // 1 -> 2
    expect(getCurrentHookIndex()).toBe(2);

    // Reset by setting a new instance
    setCurrentInstance(instance);
    expect(getCurrentHookIndex()).toBe(0);

    setCurrentInstance(null);
  });
});
