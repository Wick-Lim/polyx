import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createContext, useContext } from '../context.js';
import { setCurrentInstance } from '../hooks-internals.js';
import type { ComponentInstance } from '@polyx/core';

function createMockInstance(element?: HTMLElement): ComponentInstance {
  return {
    hooks: [],
    hookIndex: 0,
    effects: [],
    layoutEffects: [],
    element: element || document.createElement('div'),
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

describe('useContext with selector', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should return selected value from provider', () => {
    const ctx = createContext({ name: 'Alice', age: 30 });
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = { name: 'Bob', age: 25 };

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);
    const selectedName = withInstance(instance, () =>
      useContext(ctx, (val) => val.name)
    );

    expect(selectedName).toBe('Bob');
  });

  it('should return selected value from default when no provider exists', () => {
    const ctx = createContext({ name: 'DefaultUser', age: 0 });
    const element = document.createElement('div');
    document.body.appendChild(element);

    const instance = createMockInstance(element);
    const selectedName = withInstance(instance, () =>
      useContext(ctx, (val) => val.name)
    );

    expect(selectedName).toBe('DefaultUser');
  });

  it('should only re-render when selected value changes', () => {
    const ctx = createContext({ name: 'Alice', age: 30 });
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = { name: 'Alice', age: 30 };

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);
    withInstance(instance, () => useContext(ctx, (val) => val.name));

    // Change context to a new object where name IS different
    provider.value = { name: 'Bob', age: 30 };

    expect(instance.render).toHaveBeenCalledTimes(1);
  });

  it('should NOT re-render when unrelated part of context changes', () => {
    const ctx = createContext({ name: 'Alice', age: 30 });
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = { name: 'Alice', age: 30 };

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);
    withInstance(instance, () => useContext(ctx, (val) => val.name));

    // Change age only -- name stays the same, so selected value is unchanged
    provider.value = { name: 'Alice', age: 31 };

    expect(instance.render).not.toHaveBeenCalled();
  });

  it('should return cached selectedValue on subsequent calls', () => {
    const ctx = createContext({ x: 1, y: 2 });
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = { x: 10, y: 20 };

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);

    // First call: traverses DOM, subscribes, computes initial selected value
    const val1 = withInstance(instance, () =>
      useContext(ctx, (val) => val.x)
    );
    expect(val1).toBe(10);

    // Second call: should read from cached hook (hook already exists at index)
    const val2 = withInstance(instance, () =>
      useContext(ctx, (val) => val.x)
    );
    expect(val2).toBe(10);

    // hooks array should still be length 1 (not pushed again)
    expect(instance.hooks).toHaveLength(1);
    expect(instance.hooks[0].selectedValue).toBe(10);
  });

  it('should work with object context selecting a specific property', () => {
    interface ThemeContext {
      mode: 'light' | 'dark';
      accent: string;
      fontSize: number;
    }
    const defaultTheme: ThemeContext = { mode: 'light', accent: 'blue', fontSize: 14 };
    const ctx = createContext(defaultTheme);
    const provider = document.createElement(ctx.Provider) as any;
    const theme: ThemeContext = { mode: 'dark', accent: 'red', fontSize: 16 };
    provider.value = theme;

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);

    // Select only the mode property
    const mode = withInstance(instance, () =>
      useContext(ctx, (val) => val.mode)
    );
    expect(mode).toBe('dark');

    // Change accent but keep mode the same -- should NOT re-render
    provider.value = { mode: 'dark', accent: 'green', fontSize: 18 };
    expect(instance.render).not.toHaveBeenCalled();

    // Change mode -- should re-render
    provider.value = { mode: 'light', accent: 'green', fontSize: 18 };
    expect(instance.render).toHaveBeenCalledTimes(1);

    // After re-render, the cached selectedValue should be updated
    expect(instance.hooks[0].selectedValue).toBe('light');
  });

  it('should still re-render on every value change without selector (backward compat)', () => {
    const ctx = createContext({ name: 'Alice', age: 30 });
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = { name: 'Alice', age: 30 };

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);

    // Call without selector
    const value = withInstance(instance, () => useContext(ctx));
    expect(value).toEqual({ name: 'Alice', age: 30 });

    // Change only age -- without selector, it should re-render on every change
    provider.value = { name: 'Alice', age: 31 };
    expect(instance.render).toHaveBeenCalledTimes(1);

    // Change again to another different object
    provider.value = { name: 'Alice', age: 32 };
    expect(instance.render).toHaveBeenCalledTimes(2);
  });

  it('should handle no provider case with selector and default value', () => {
    const ctx = createContext({ count: 42, label: 'items' });
    const element = document.createElement('div');
    document.body.appendChild(element);

    const instance = createMockInstance(element);

    // No provider in DOM -- selector applied to defaultValue
    const selected = withInstance(instance, () =>
      useContext(ctx, (val) => val.count)
    );
    expect(selected).toBe(42);

    // Hook should be stored with null provider and correct selectedValue
    expect(instance.hooks).toHaveLength(1);
    expect(instance.hooks[0].provider).toBeNull();
    expect(instance.hooks[0].selector).toBeDefined();
    expect(instance.hooks[0].selectedValue).toBe(42);
  });

  it('should return selectedValue from cached hook when selector is present', () => {
    // This tests the _readHook integration path:
    // On subsequent render calls, the hook already exists (instance.hooks.length > index),
    // and when hook.selector is truthy, it should return hook.selectedValue.
    const ctx = createContext({ a: 1, b: 2 });
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = { a: 100, b: 200 };

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);

    // First render: initializes the hook
    const val1 = withInstance(instance, () =>
      useContext(ctx, (val) => val.a)
    );
    expect(val1).toBe(100);

    // Simulate a provider value change that changes the selected value
    provider.value = { a: 999, b: 200 };
    expect(instance.render).toHaveBeenCalledTimes(1);

    // The subscription callback should have updated selectedValue in the hook
    expect(instance.hooks[0].selectedValue).toBe(999);

    // Second render: reads from cached hook, returns updated selectedValue
    const val2 = withInstance(instance, () =>
      useContext(ctx, (val) => val.a)
    );
    expect(val2).toBe(999);

    // hooks array should still be length 1
    expect(instance.hooks).toHaveLength(1);
  });

  it('should use reference equality for selected value comparison', () => {
    // When the selector returns the same object reference, skip re-render.
    // When it returns a new object (even if deeply equal), trigger re-render.
    const sharedArray = [1, 2, 3];
    const ctx = createContext({ items: sharedArray, label: 'test' });
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = { items: sharedArray, label: 'test' };

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);
    withInstance(instance, () => useContext(ctx, (val) => val.items));

    // Change label but keep the same items array reference -- should NOT re-render
    provider.value = { items: sharedArray, label: 'changed' };
    expect(instance.render).not.toHaveBeenCalled();

    // Now change items to a new array with same contents -- SHOULD re-render
    // because reference equality fails (new array !== old array)
    provider.value = { items: [1, 2, 3], label: 'changed' };
    expect(instance.render).toHaveBeenCalledTimes(1);
  });

  it('should return selected default value from cached hook when provider is null', () => {
    // Tests the path: subsequent call, hook exists, hook.provider is null, selector is truthy
    // Should return selector(context._defaultValue) from line 84
    const ctx = createContext({ status: 'idle', count: 0 });
    const element = document.createElement('div');
    document.body.appendChild(element);

    const instance = createMockInstance(element);

    // First call: no provider found
    const val1 = withInstance(instance, () =>
      useContext(ctx, (val) => val.status)
    );
    expect(val1).toBe('idle');

    // Second call: hook exists with null provider, selector path
    const val2 = withInstance(instance, () =>
      useContext(ctx, (val) => val.status)
    );
    expect(val2).toBe('idle');

    expect(instance.hooks).toHaveLength(1);
  });

  it('should store selector function in the hook entry', () => {
    const ctx = createContext({ v: 1 });
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = { v: 5 };

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);
    const selector = (val: { v: number }) => val.v;
    withInstance(instance, () => useContext(ctx, selector));

    expect(instance.hooks[0].selector).toBe(selector);
    expect(instance.hooks[0].selectedValue).toBe(5);
  });

  it('should store null selector in hook entry when no selector is provided', () => {
    const ctx = createContext('simple');
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = 'hello';

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);
    withInstance(instance, () => useContext(ctx));

    expect(instance.hooks[0].selector).toBeNull();
    expect(instance.hooks[0].selectedValue).toBeNull();
  });

  it('should handle selector that derives computed values', () => {
    const ctx = createContext({ items: [1, 2, 3] });
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = { items: [10, 20, 30] };

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);

    // Selector computes a derived value (sum of items)
    const sum = withInstance(instance, () =>
      useContext(ctx, (val) => val.items.reduce((a, b) => a + b, 0))
    );
    expect(sum).toBe(60);

    // Change to items with same sum -- should NOT re-render (60 === 60)
    provider.value = { items: [30, 20, 10] };
    expect(instance.render).not.toHaveBeenCalled();

    // Change to items with different sum -- should re-render
    provider.value = { items: [10, 20, 30, 40] };
    expect(instance.render).toHaveBeenCalledTimes(1);
    expect(instance.hooks[0].selectedValue).toBe(100);
  });

  it('should include cleanup/unsubscribe in hook when provider is found with selector', () => {
    const ctx = createContext({ n: 0 });
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = { n: 1 };

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);
    withInstance(instance, () => useContext(ctx, (val) => val.n));

    // Hook should have both unsubscribe and cleanup
    expect(typeof instance.hooks[0].unsubscribe).toBe('function');
    expect(typeof instance.hooks[0].cleanup).toBe('function');

    // Calling cleanup should unsubscribe -- no more re-renders on change
    instance.hooks[0].cleanup();
    (instance.render as ReturnType<typeof vi.fn>).mockClear();
    provider.value = { n: 999 };
    expect(instance.render).not.toHaveBeenCalled();
  });
});
