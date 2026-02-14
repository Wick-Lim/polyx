import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTransition, useDeferredValue } from '../hooks.js';
import { setCurrentInstance } from '../hooks-internals.js';
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

describe('useTransition', () => {
  it('should return [isPending, startTransition] with isPending initially false', () => {
    const instance = createMockInstance();

    const [isPending, startTransition] = withInstance(instance, () => useTransition());

    expect(isPending).toBe(false);
    expect(typeof startTransition).toBe('function');
  });

  it('should call render synchronously with isPending=true when startTransition is invoked', () => {
    const instance = createMockInstance();

    const [, startTransition] = withInstance(instance, () => useTransition());

    // Track isPending at the time render is called
    let isPendingDuringFirstRender: boolean | undefined;
    (instance.render as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      isPendingDuringFirstRender = instance.hooks[0].isPending;
    });

    const callback = vi.fn();
    startTransition(callback);

    // The first render call should have seen isPending=true
    expect(isPendingDuringFirstRender).toBe(true);

    // render should have been called (at least once for isPending=true)
    expect(instance.render).toHaveBeenCalled();

    // callback should have been called
    expect(callback).toHaveBeenCalled();
  });

  it('should persist hook across renders (subsequent calls return same hook)', () => {
    const instance = createMockInstance();

    // First render
    const [isPending1, startTransition1] = withInstance(instance, () => useTransition());

    // Second render
    const [isPending2, startTransition2] = withInstance(instance, () => useTransition());

    expect(isPending1).toBe(isPending2);
    expect(startTransition1).toBe(startTransition2);
  });

  it('should set isPending back to false after transition completes (no transition work)', () => {
    const instance = createMockInstance();

    const [, startTransition] = withInstance(instance, () => useTransition());

    // startTransitionWithCallback calls onComplete immediately when pendingCount === 0
    // (i.e., callback didn't call scheduleTransition)
    const callback = vi.fn();
    startTransition(callback);

    // Because the callback doesn't schedule any transition work,
    // startTransitionWithCallback calls onComplete immediately (pendingCount === 0).
    // This means isPending should be set back to false.
    expect(instance.hooks[0].isPending).toBe(false);

    // render should have been called twice:
    // once for isPending=true, once for isPending=false (onComplete)
    expect(instance.render).toHaveBeenCalledTimes(2);
  });

  it('should call the user callback inside the transition', () => {
    const instance = createMockInstance();

    const [, startTransition] = withInstance(instance, () => useTransition());

    let callbackExecuted = false;
    startTransition(() => {
      callbackExecuted = true;
    });

    expect(callbackExecuted).toBe(true);
  });

  it('should throw when called without instance', () => {
    expect(() => useTransition()).toThrow('Hooks can only be called inside a component');
  });
});

describe('useDeferredValue', () => {
  it('should return the initial value on first render', () => {
    const instance = createMockInstance();

    const deferred = withInstance(instance, () => useDeferredValue('initial'));

    expect(deferred).toBe('initial');
  });

  it('should return the same value when value has not changed', () => {
    const instance = createMockInstance();

    // First render
    withInstance(instance, () => useDeferredValue('same'));

    // Second render with same value
    const deferred = withInstance(instance, () => useDeferredValue('same'));

    expect(deferred).toBe('same');
  });

  it('should return old deferred value initially when value changes', () => {
    const instance = createMockInstance();

    // First render: value = 'old'
    const deferred1 = withInstance(instance, () => useDeferredValue('old'));
    expect(deferred1).toBe('old');

    // Second render: value changes to 'new'
    const deferred2 = withInstance(instance, () => useDeferredValue('new'));

    // Should still return the old deferred value
    expect(deferred2).toBe('old');

    // But currentValue should be updated
    expect(instance.hooks[0].currentValue).toBe('new');
  });

  it('should schedule a transition to update deferred value when value changes', async () => {
    const instance = createMockInstance();

    // First render
    withInstance(instance, () => useDeferredValue('v1'));

    // Second render with changed value
    withInstance(instance, () => useDeferredValue('v2'));

    // pendingUpdate should be true
    expect(instance.hooks[0].pendingUpdate).toBe(true);

    // The transition is scheduled via requestAnimationFrame in scheduleTransition
    // Wait for RAF + microtask to flush
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    // After the transition completes, the hook should be updated
    expect(instance.hooks[0].pendingUpdate).toBe(false);
    // deferredValue should now match currentValue
    expect(instance.hooks[0].deferredValue).toBe('v2');
    // render should have been called to reflect the updated deferred value
    expect(instance.render).toHaveBeenCalled();
  });

  it('should not schedule multiple transitions when value changes rapidly (pendingUpdate guard)', () => {
    const instance = createMockInstance();

    // First render
    withInstance(instance, () => useDeferredValue('v1'));

    // Second render: triggers transition
    withInstance(instance, () => useDeferredValue('v2'));
    expect(instance.hooks[0].pendingUpdate).toBe(true);

    // Third render: value changes again, but pendingUpdate is already true
    withInstance(instance, () => useDeferredValue('v3'));

    // pendingUpdate should still be true
    expect(instance.hooks[0].pendingUpdate).toBe(true);
    // currentValue should be updated to latest
    expect(instance.hooks[0].currentValue).toBe('v3');
  });

  it('should handle value changes with Object.is semantics (NaN equals NaN)', () => {
    const instance = createMockInstance();

    // First render with NaN
    const deferred1 = withInstance(instance, () => useDeferredValue(NaN));
    expect(deferred1).toBeNaN();

    // Second render with NaN again - should be treated as same value
    const deferred2 = withInstance(instance, () => useDeferredValue(NaN));
    expect(deferred2).toBeNaN();

    // pendingUpdate should NOT be set (NaN === NaN via Object.is)
    expect(instance.hooks[0].pendingUpdate).toBe(false);
  });

  it('should distinguish +0 and -0 via Object.is', () => {
    const instance = createMockInstance();

    // First render with +0
    withInstance(instance, () => useDeferredValue(+0));

    // Second render with -0 (Object.is(+0, -0) is false)
    const deferred = withInstance(instance, () => useDeferredValue(-0));

    // Should return old deferred value (+0)
    expect(Object.is(deferred, +0)).toBe(true);
    // But should have scheduled transition
    expect(instance.hooks[0].pendingUpdate).toBe(true);
    expect(Object.is(instance.hooks[0].currentValue, -0)).toBe(true);
  });

  it('should not call render if deferred value already matches current when transition fires', async () => {
    const instance = createMockInstance();

    // First render
    withInstance(instance, () => useDeferredValue('v1'));

    // Second render: changes value, schedules transition
    withInstance(instance, () => useDeferredValue('v2'));

    // Manually set deferredValue to match currentValue before transition fires
    // (simulating the case where it's already up to date)
    instance.hooks[0].deferredValue = 'v2';

    // Wait for RAF + microtask to flush the scheduled transition
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    // render should NOT have been called since deferredValue === currentValue
    expect(instance.render).not.toHaveBeenCalled();
    expect(instance.hooks[0].pendingUpdate).toBe(false);
  });

  it('should throw when called without instance', () => {
    expect(() => useDeferredValue('test')).toThrow('Hooks can only be called inside a component');
  });
});
