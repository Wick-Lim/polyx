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

describe('createContext', () => {
  it('should return an object with _id, _defaultValue, and Provider', () => {
    const ctx = createContext('hello');
    expect(ctx._id).toBeDefined();
    expect(typeof ctx._id).toBe('string');
    expect(ctx._id).toMatch(/^__polyx_ctx_\d+$/);
    expect(ctx._defaultValue).toBe('hello');
    expect(ctx.Provider).toBeDefined();
    expect(typeof ctx.Provider).toBe('string');
    expect(ctx.Provider).toMatch(/^polyx-ctx-provider-\d+$/);
  });

  it('should assign unique _id for each context', () => {
    const ctx1 = createContext(1);
    const ctx2 = createContext(2);
    expect(ctx1._id).not.toBe(ctx2._id);
    expect(ctx1.Provider).not.toBe(ctx2.Provider);
  });

  it('should register a custom element for the Provider', () => {
    const ctx = createContext('default');
    const ProviderClass = customElements.get(ctx.Provider);
    expect(ProviderClass).toBeDefined();
  });

  it('should store any type as defaultValue', () => {
    const objDefault = { theme: 'dark' };
    const ctx = createContext(objDefault);
    expect(ctx._defaultValue).toBe(objDefault);
  });

  describe('Provider element', () => {
    it('should have a value getter that returns the default value initially', () => {
      const ctx = createContext(42);
      const provider = document.createElement(ctx.Provider) as any;
      expect(provider.value).toBe(42);
    });

    it('should have a value setter that updates the value', () => {
      const ctx = createContext(0);
      const provider = document.createElement(ctx.Provider) as any;
      provider.value = 99;
      expect(provider.value).toBe(99);
    });

    it('should notify subscribers when value changes', () => {
      const ctx = createContext('initial');
      const provider = document.createElement(ctx.Provider) as any;
      const subscriber = vi.fn();
      provider.subscribe(subscriber);

      provider.value = 'updated';

      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('should NOT notify subscribers when value is set to the same value', () => {
      const ctx = createContext(10);
      const provider = document.createElement(ctx.Provider) as any;
      const subscriber = vi.fn();
      provider.subscribe(subscriber);

      provider.value = 10; // same value

      expect(subscriber).not.toHaveBeenCalled();
    });

    it('should notify multiple subscribers', () => {
      const ctx = createContext('a');
      const provider = document.createElement(ctx.Provider) as any;
      const sub1 = vi.fn();
      const sub2 = vi.fn();
      provider.subscribe(sub1);
      provider.subscribe(sub2);

      provider.value = 'b';

      expect(sub1).toHaveBeenCalledTimes(1);
      expect(sub2).toHaveBeenCalledTimes(1);
    });

    it('should set value via _setProp when name is "value"', () => {
      const ctx = createContext(0);
      const provider = document.createElement(ctx.Provider) as any;
      provider._setProp('value', 55);
      expect(provider.value).toBe(55);
    });

    it('should not change value via _setProp when name is not "value"', () => {
      const ctx = createContext(0);
      const provider = document.createElement(ctx.Provider) as any;
      provider._setProp('other', 55);
      expect(provider.value).toBe(0);
    });

    it('should set value via _setProps when props contain "value"', () => {
      const ctx = createContext('old');
      const provider = document.createElement(ctx.Provider) as any;
      provider._setProps({ value: 'new' });
      expect(provider.value).toBe('new');
    });

    it('should not change value via _setProps when props do not contain "value"', () => {
      const ctx = createContext('old');
      const provider = document.createElement(ctx.Provider) as any;
      provider._setProps({ other: 'new' });
      expect(provider.value).toBe('old');
    });

    it('should return an unsubscribe function from subscribe', () => {
      const ctx = createContext(0);
      const provider = document.createElement(ctx.Provider) as any;
      const subscriber = vi.fn();
      const unsubscribe = provider.subscribe(subscriber);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should remove subscriber when unsubscribe is called', () => {
      const ctx = createContext(0);
      const provider = document.createElement(ctx.Provider) as any;
      const subscriber = vi.fn();
      const unsubscribe = provider.subscribe(subscriber);

      unsubscribe();
      provider.value = 100;

      expect(subscriber).not.toHaveBeenCalled();
    });

    it('should have contextId that matches the context _id', () => {
      const ctx = createContext('test');
      const provider = document.createElement(ctx.Provider) as any;
      expect(provider.contextId).toBe(ctx._id);
    });
  });
});

describe('useContext', () => {
  afterEach(() => {
    // Clean up any appended elements
    document.body.innerHTML = '';
  });

  it('should throw when called outside a component', () => {
    const ctx = createContext('default');
    expect(() => useContext(ctx)).toThrow('Hooks can only be called inside a component');
  });

  it('should return defaultValue when no provider exists in the DOM tree', () => {
    const ctx = createContext('fallback');
    const element = document.createElement('div');
    document.body.appendChild(element);

    const instance = createMockInstance(element);
    const value = withInstance(instance, () => useContext(ctx));

    expect(value).toBe('fallback');
  });

  it('should push hook with null provider when no provider found', () => {
    const ctx = createContext('fallback');
    const element = document.createElement('div');
    document.body.appendChild(element);

    const instance = createMockInstance(element);
    withInstance(instance, () => useContext(ctx));

    expect(instance.hooks).toHaveLength(1);
    expect(instance.hooks[0].provider).toBeNull();
    expect(instance.hooks[0].unsubscribe).toBeNull();
  });

  it('should find provider in DOM tree and return its value', () => {
    const ctx = createContext('default');
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = 'from-provider';

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);
    const value = withInstance(instance, () => useContext(ctx));

    expect(value).toBe('from-provider');
  });

  it('should subscribe to provider for re-renders', () => {
    const ctx = createContext('default');
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = 'initial';

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);
    withInstance(instance, () => useContext(ctx));

    // Change provider value -- should trigger render
    provider.value = 'changed';

    expect(instance.render).toHaveBeenCalled();
  });

  it('should push hook with provider reference and unsubscribe/cleanup', () => {
    const ctx = createContext('default');
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = 'val';

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);
    withInstance(instance, () => useContext(ctx));

    expect(instance.hooks).toHaveLength(1);
    expect(instance.hooks[0].provider).toBe(provider);
    expect(typeof instance.hooks[0].unsubscribe).toBe('function');
    expect(typeof instance.hooks[0].cleanup).toBe('function');
  });

  it('should cache provider on subsequent calls (no re-traversal)', () => {
    const ctx = createContext('default');
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = 'cached-val';

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);

    // First call: traverses DOM
    const value1 = withInstance(instance, () => useContext(ctx));
    expect(value1).toBe('cached-val');

    // Update provider value
    provider.value = 'new-val';

    // Second call: should read from cached hook (no DOM traversal)
    const value2 = withInstance(instance, () => useContext(ctx));
    expect(value2).toBe('new-val');

    // hooks array should still be length 1 (not pushed again)
    expect(instance.hooks).toHaveLength(1);
  });

  it('should return defaultValue from cached hook when provider is null', () => {
    const ctx = createContext('default-cached');
    const element = document.createElement('div');
    document.body.appendChild(element);

    const instance = createMockInstance(element);

    // First call: no provider found, pushes { provider: null }
    const value1 = withInstance(instance, () => useContext(ctx));
    expect(value1).toBe('default-cached');

    // Second call: reads cached hook with null provider (line 78)
    const value2 = withInstance(instance, () => useContext(ctx));
    expect(value2).toBe('default-cached');

    // hooks array should still be length 1
    expect(instance.hooks).toHaveLength(1);
  });

  it('should find the nearest provider when multiple providers are nested', () => {
    const ctx = createContext('default');
    const outerProvider = document.createElement(ctx.Provider) as any;
    outerProvider.value = 'outer';

    const innerProvider = document.createElement(ctx.Provider) as any;
    innerProvider.value = 'inner';

    const child = document.createElement('div');
    innerProvider.appendChild(child);
    outerProvider.appendChild(innerProvider);
    document.body.appendChild(outerProvider);

    const instance = createMockInstance(child);
    const value = withInstance(instance, () => useContext(ctx));

    // Should find the inner provider (first one encountered walking up the tree)
    expect(value).toBe('inner');
  });

  it('should allow unsubscribe from provider via hook cleanup', () => {
    const ctx = createContext('default');
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = 'start';

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);
    withInstance(instance, () => useContext(ctx));

    // Call cleanup (unsubscribe)
    instance.hooks[0].cleanup();

    // Provider value change should NOT trigger render anymore
    (instance.render as ReturnType<typeof vi.fn>).mockClear();
    provider.value = 'after-unsubscribe';

    expect(instance.render).not.toHaveBeenCalled();
  });

  it('should work with non-primitive context values', () => {
    const defaultTheme = { mode: 'light', accent: 'blue' };
    const ctx = createContext(defaultTheme);
    const provider = document.createElement(ctx.Provider) as any;
    const newTheme = { mode: 'dark', accent: 'red' };
    provider.value = newTheme;

    const child = document.createElement('div');
    provider.appendChild(child);
    document.body.appendChild(provider);

    const instance = createMockInstance(child);
    const value = withInstance(instance, () => useContext(ctx));

    expect(value).toBe(newTheme);
    expect(value.mode).toBe('dark');
  });

  it('should handle the element itself being the provider', () => {
    // Edge case: the component element itself is the provider
    const ctx = createContext('default');
    const provider = document.createElement(ctx.Provider) as any;
    provider.value = 'self-provider';
    document.body.appendChild(provider);

    const instance = createMockInstance(provider);
    const value = withInstance(instance, () => useContext(ctx));

    expect(value).toBe('self-provider');
  });
});
