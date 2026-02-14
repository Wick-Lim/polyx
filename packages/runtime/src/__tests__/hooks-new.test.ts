import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReducer, useId } from '../hooks.js';
import { setCurrentInstance, resetIdCounter } from '../hooks-internals.js';
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

describe('useReducer', () => {
  it('should return initial state and dispatch', () => {
    const instance = createMockInstance();
    const reducer = (state: number, action: { type: string }) => state;

    const [state, dispatch] = withInstance(instance, () =>
      useReducer(reducer, 0)
    );

    expect(state).toBe(0);
    expect(typeof dispatch).toBe('function');
  });

  it('should apply reducer on dispatch', () => {
    const instance = createMockInstance();
    type Action = { type: 'increment' } | { type: 'decrement' };
    const reducer = (state: number, action: Action) => {
      switch (action.type) {
        case 'increment': return state + 1;
        case 'decrement': return state - 1;
        default: return state;
      }
    };

    const [, dispatch] = withInstance(instance, () =>
      useReducer(reducer, 0)
    );

    dispatch({ type: 'increment' });
    expect(instance.hooks[0]).toBe(1);
    expect(instance.render).toHaveBeenCalledTimes(1);

    dispatch({ type: 'increment' });
    expect(instance.hooks[0]).toBe(2);
    expect(instance.render).toHaveBeenCalledTimes(2);

    dispatch({ type: 'decrement' });
    expect(instance.hooks[0]).toBe(1);
    expect(instance.render).toHaveBeenCalledTimes(3);
  });

  it('should support init function (3rd argument)', () => {
    const instance = createMockInstance();
    const reducer = (state: number, action: number) => state + action;
    const init = (initialArg: number) => initialArg * 10;

    const [state] = withInstance(instance, () =>
      useReducer(reducer, 5, init)
    );

    expect(state).toBe(50);
  });

  it('should not trigger render when state is unchanged (Object.is)', () => {
    const instance = createMockInstance();
    const reducer = (state: number, _action: string) => state; // always returns same state

    const [, dispatch] = withInstance(instance, () =>
      useReducer(reducer, 42)
    );

    dispatch('any');
    expect(instance.render).not.toHaveBeenCalled();
  });

  it('should persist state across renders', () => {
    const instance = createMockInstance();
    const reducer = (state: number, action: number) => state + action;

    // First render
    const [state1, dispatch] = withInstance(instance, () =>
      useReducer(reducer, 0)
    );
    expect(state1).toBe(0);

    dispatch(5);
    expect(instance.hooks[0]).toBe(5);

    // Second render — should read persisted state
    const [state2] = withInstance(instance, () =>
      useReducer(reducer, 0)
    );
    expect(state2).toBe(5);
  });

  it('should handle complex state objects', () => {
    const instance = createMockInstance();
    type State = { count: number; items: string[] };
    type Action = { type: 'add'; item: string } | { type: 'reset' };
    const reducer = (state: State, action: Action): State => {
      switch (action.type) {
        case 'add': return { ...state, items: [...state.items, action.item], count: state.count + 1 };
        case 'reset': return { count: 0, items: [] };
        default: return state;
      }
    };

    const [state, dispatch] = withInstance(instance, () =>
      useReducer(reducer, { count: 0, items: [] })
    );

    expect(state).toEqual({ count: 0, items: [] });

    dispatch({ type: 'add', item: 'hello' });
    expect(instance.hooks[0]).toEqual({ count: 1, items: ['hello'] });

    dispatch({ type: 'add', item: 'world' });
    expect(instance.hooks[0]).toEqual({ count: 2, items: ['hello', 'world'] });

    dispatch({ type: 'reset' });
    expect(instance.hooks[0]).toEqual({ count: 0, items: [] });
  });

  it('should throw when called without instance', () => {
    const reducer = (s: number, a: number) => s + a;
    expect(() => useReducer(reducer, 0)).toThrow('Hooks can only be called inside a component');
  });
});

describe('useId', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  it('should return a string ID in :rN: format', () => {
    const instance = createMockInstance();

    const id = withInstance(instance, () => useId());

    expect(id).toMatch(/^:r\d+:$/);
  });

  it('should return the same ID on re-render', () => {
    const instance = createMockInstance();

    const id1 = withInstance(instance, () => useId());
    const id2 = withInstance(instance, () => useId());

    expect(id1).toBe(id2);
  });

  it('should generate different IDs for different hook slots', () => {
    const instance = createMockInstance();

    const [id1, id2] = withInstance(instance, () => {
      const a = useId();
      const b = useId();
      return [a, b];
    });

    expect(id1).not.toBe(id2);
  });

  it('should generate unique IDs across components', () => {
    const instance1 = createMockInstance();
    const instance2 = createMockInstance();

    const id1 = withInstance(instance1, () => useId());
    const id2 = withInstance(instance2, () => useId());

    expect(id1).not.toBe(id2);
  });

  it('should produce deterministic IDs after resetIdCounter', () => {
    const instance1 = createMockInstance();
    const id1 = withInstance(instance1, () => useId());

    resetIdCounter();

    const instance2 = createMockInstance();
    const id2 = withInstance(instance2, () => useId());

    expect(id1).toBe(id2);
  });

  it('should throw when called without instance', () => {
    expect(() => useId()).toThrow('Hooks can only be called inside a component');
  });
});
