import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isSuspensePromise, findSuspenseBoundary, lazy, PolyXSuspense } from '../suspense.js';

// ---- helpers ----

let tagCounter = 0;

/** Generate a unique tag name to avoid customElements.define collisions across tests. */
function uniqueTag(prefix = 'test-lazy'): string {
  return `${prefix}-${++tagCounter}-${Date.now()}`;
}

/** Flush one microtask tick. */
function tick(): Promise<void> {
  return new Promise(r => queueMicrotask(r));
}

/** Create a deferred promise that can be resolved/rejected externally. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---- isSuspensePromise ----

describe('isSuspensePromise', () => {
  it('should return true for a real Promise', () => {
    expect(isSuspensePromise(Promise.resolve())).toBe(true);
    expect(isSuspensePromise(new Promise(() => {}))).toBe(true);
  });

  it('should return true for a thenable object (has .then method)', () => {
    const thenable = { then: () => {} };
    expect(isSuspensePromise(thenable)).toBe(true);
  });

  it('should return true for a thenable with extra properties', () => {
    const thenable = { then: vi.fn(), catch: vi.fn(), custom: 42 };
    expect(isSuspensePromise(thenable)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isSuspensePromise(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isSuspensePromise(undefined)).toBe(false);
  });

  it('should return false for a string', () => {
    expect(isSuspensePromise('hello')).toBe(false);
  });

  it('should return false for a number', () => {
    expect(isSuspensePromise(42)).toBe(false);
  });

  it('should return false for a boolean', () => {
    expect(isSuspensePromise(true)).toBe(false);
  });

  it('should return false for a plain object without .then', () => {
    expect(isSuspensePromise({ foo: 'bar' })).toBe(false);
  });

  it('should return false for an array', () => {
    expect(isSuspensePromise([1, 2, 3])).toBe(false);
  });

  it('should return false for a function (not an object with .then)', () => {
    expect(isSuspensePromise(() => {})).toBe(false);
  });
});

// ---- findSuspenseBoundary ----

describe('findSuspenseBoundary', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should return null when no boundary exists', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    expect(findSuspenseBoundary(div)).toBeNull();
  });

  it('should return null for an element with no parent', () => {
    const orphan = document.createElement('div');
    expect(findSuspenseBoundary(orphan)).toBeNull();
  });

  it('should find nearest PolyXSuspense ancestor', () => {
    const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
    const child = document.createElement('div');
    suspense.appendChild(child);
    document.body.appendChild(suspense);

    expect(findSuspenseBoundary(child)).toBe(suspense);
  });

  it('should skip non-Suspense parents and find the ancestor', () => {
    const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
    const wrapper = document.createElement('div');
    const inner = document.createElement('span');
    const deep = document.createElement('p');

    suspense.appendChild(wrapper);
    wrapper.appendChild(inner);
    inner.appendChild(deep);
    document.body.appendChild(suspense);

    expect(findSuspenseBoundary(deep)).toBe(suspense);
  });

  it('should return the nearest PolyXSuspense when nested', () => {
    const outer = document.createElement('polyx-suspense') as PolyXSuspense;
    const inner = document.createElement('polyx-suspense') as PolyXSuspense;
    const child = document.createElement('div');

    outer.appendChild(inner);
    inner.appendChild(child);
    document.body.appendChild(outer);

    // Should find inner, not outer
    expect(findSuspenseBoundary(child)).toBe(inner);
  });
});

// ---- lazy() ----

describe('lazy', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should return a class (constructor function)', () => {
    const LazyComp = lazy(() => Promise.resolve({ default: HTMLElement as any }));
    expect(typeof LazyComp).toBe('function');
    expect(LazyComp.prototype).toBeDefined();
  });

  describe('connectedCallback when module is pending', () => {
    it('should throw the loading promise for Suspense to catch', () => {
      const { promise } = deferred<{ default: typeof HTMLElement }>();
      const LazyComp = lazy(() => promise);
      const tagName = uniqueTag('lazy-pending');
      customElements.define(tagName, LazyComp);

      const el = document.createElement(tagName);

      // connectedCallback should throw the promise
      expect(() => {
        document.body.appendChild(el);
      }).toThrow();
    });
  });

  describe('connectedCallback when module is resolved', () => {
    it('should call _upgrade and create the real element', async () => {
      const realTag = uniqueTag('real-comp');

      class RealComponent extends HTMLElement {
        static __polyxTagName = realTag;
        _setProps = vi.fn();
      }
      customElements.define(realTag, RealComponent);

      const LazyComp = lazy(() => Promise.resolve({ default: RealComponent as any }));

      // Wait for the loader promise to resolve
      await tick();
      await tick();

      const lazyTag = uniqueTag('lazy-resolved');
      customElements.define(lazyTag, LazyComp);

      const el = document.createElement(lazyTag);
      document.body.appendChild(el);

      // After mounting, the real element should be created inside
      const realEl = el.querySelector(realTag);
      expect(realEl).not.toBeNull();
    });
  });

  describe('connectedCallback when module is rejected', () => {
    it('should throw the error', async () => {
      const error = new Error('Load failed');
      const { promise, reject } = deferred<{ default: typeof HTMLElement }>();

      const LazyComp = lazy(() => promise);

      const tagName = uniqueTag('lazy-rejected');
      customElements.define(tagName, LazyComp);

      // While pending, connectedCallback throws the promise.
      // We catch it here so we can attach a .catch() to suppress unhandled rejection.
      const el = document.createElement(tagName);
      let thrownPromise: Promise<any> | undefined;
      try {
        document.body.appendChild(el);
      } catch (thrown) {
        thrownPromise = thrown as Promise<any>;
      }
      // Suppress unhandled rejection on the internal promise
      thrownPromise?.catch(() => {});

      // Now reject the loader promise
      reject(error);
      await promise.catch(() => {});
      await tick();

      // Remove and re-create element to test the rejected state path
      document.body.removeChild(el);
      const el2 = document.createElement(tagName);
      expect(() => {
        document.body.appendChild(el2);
      }).toThrow('Load failed');
    });
  });

  describe('_setProp', () => {
    it('should store pending props before upgrade', async () => {
      const { promise, resolve } = deferred<{ default: typeof HTMLElement }>();
      const LazyComp = lazy(() => promise);
      const tagName = uniqueTag('lazy-setprop');
      customElements.define(tagName, LazyComp);

      const el = document.createElement(tagName) as any;

      // Set props before connecting (before upgrade)
      el._setProp('color', 'red');
      el._setProp('size', 42);

      expect(el._pendingProps).toEqual({ color: 'red', size: 42 });
    });

    it('should forward props to inner component after upgrade', async () => {
      const realTag = uniqueTag('real-fwd');
      const innerSetProp = vi.fn();

      class RealComponent extends HTMLElement {
        static __polyxTagName = realTag;
        _setProp = innerSetProp;
        _setProps = vi.fn();
      }
      customElements.define(realTag, RealComponent);

      const LazyComp = lazy(() => Promise.resolve({ default: RealComponent as any }));
      await tick();
      await tick();

      const lazyTag = uniqueTag('lazy-fwd');
      customElements.define(lazyTag, LazyComp);

      const el = document.createElement(lazyTag) as any;
      document.body.appendChild(el);

      // After upgrade, _setProp should forward to inner
      el._setProp('title', 'Hello');

      const inner = el.firstElementChild as any;
      expect(inner).not.toBeNull();
      expect(inner._setProp).toHaveBeenCalledWith('title', 'Hello');
    });
  });

  describe('_setProps', () => {
    it('should store pending props before upgrade', () => {
      const { promise } = deferred<{ default: typeof HTMLElement }>();
      const LazyComp = lazy(() => promise);
      const tagName = uniqueTag('lazy-setprops');
      customElements.define(tagName, LazyComp);

      const el = document.createElement(tagName) as any;

      el._setProps({ a: 1, b: 2 });

      expect(el._pendingProps).toEqual({ a: 1, b: 2 });
    });

    it('should merge props from multiple _setProps calls', () => {
      const { promise } = deferred<{ default: typeof HTMLElement }>();
      const LazyComp = lazy(() => promise);
      const tagName = uniqueTag('lazy-mergeprops');
      customElements.define(tagName, LazyComp);

      const el = document.createElement(tagName) as any;

      el._setProps({ a: 1 });
      el._setProps({ b: 2 });

      expect(el._pendingProps).toEqual({ a: 1, b: 2 });
    });

    it('should forward props to inner component after upgrade', async () => {
      const realTag = uniqueTag('real-fwdprops');
      const innerSetProps = vi.fn();

      class RealComponent extends HTMLElement {
        static __polyxTagName = realTag;
        _setProps = innerSetProps;
      }
      customElements.define(realTag, RealComponent);

      const LazyComp = lazy(() => Promise.resolve({ default: RealComponent as any }));
      await tick();
      await tick();

      const lazyTag = uniqueTag('lazy-fwdprops');
      customElements.define(lazyTag, LazyComp);

      const el = document.createElement(lazyTag) as any;
      document.body.appendChild(el);

      el._setProps({ x: 10, y: 20 });

      const inner = el.firstElementChild as any;
      expect(inner).not.toBeNull();
      expect(inner._setProps).toHaveBeenCalledWith({ x: 10, y: 20 });
    });
  });

  describe('_upgrade idempotency', () => {
    it('should only upgrade once even if called multiple times', async () => {
      const realTag = uniqueTag('real-idem');
      let createCount = 0;

      class RealComponent extends HTMLElement {
        static __polyxTagName = realTag;
        _setProps = vi.fn();
        constructor() {
          super();
          createCount++;
        }
      }
      customElements.define(realTag, RealComponent);

      const LazyComp = lazy(() => Promise.resolve({ default: RealComponent as any }));
      await tick();
      await tick();

      const lazyTag = uniqueTag('lazy-idem');
      customElements.define(lazyTag, LazyComp);

      const el = document.createElement(lazyTag) as any;
      document.body.appendChild(el);

      const countAfterFirst = createCount;

      // Manually try to upgrade again
      el._upgrade?.();

      // Count should not have increased
      expect(createCount).toBe(countAfterFirst);
      // Still only one child element
      expect(el.querySelectorAll(realTag).length).toBe(1);
    });
  });

  describe('_upgrade with __polyxTagName', () => {
    it('should create element using __polyxTagName and pass pending props via _setProps', async () => {
      const realTag = uniqueTag('real-tagname');
      const setPropsCallArgs: any[] = [];

      class RealComponent extends HTMLElement {
        static __polyxTagName = realTag;
        _setProps(props: any) {
          setPropsCallArgs.push(props);
        }
      }
      customElements.define(realTag, RealComponent);

      const LazyComp = lazy(() => Promise.resolve({ default: RealComponent as any }));
      await tick();
      await tick();

      const lazyTag = uniqueTag('lazy-tagname');
      customElements.define(lazyTag, LazyComp);

      const el = document.createElement(lazyTag) as any;
      el._setProp('name', 'World');
      document.body.appendChild(el);

      const inner = el.querySelector(realTag);
      expect(inner).not.toBeNull();
      expect(setPropsCallArgs[0]).toEqual({ name: 'World' });
    });

    it('should set __pendingPolyXProps when inner element has no _setProps', async () => {
      const realTag = uniqueTag('real-nosetp');

      class RealComponent extends HTMLElement {
        static __polyxTagName = realTag;
        // intentionally no _setProps
      }
      customElements.define(realTag, RealComponent);

      const LazyComp = lazy(() => Promise.resolve({ default: RealComponent as any }));
      await tick();
      await tick();

      const lazyTag = uniqueTag('lazy-nosetp');
      customElements.define(lazyTag, LazyComp);

      const el = document.createElement(lazyTag) as any;
      el._setProp('theme', 'dark');
      document.body.appendChild(el);

      const inner = el.querySelector(realTag) as any;
      expect(inner).not.toBeNull();
      expect(inner.__pendingPolyXProps).toEqual({ theme: 'dark' });
    });

    it('should move children from lazy wrapper to real element', async () => {
      const realTag = uniqueTag('real-movekids');

      class RealComponent extends HTMLElement {
        static __polyxTagName = realTag;
        _setProps = vi.fn();
      }
      customElements.define(realTag, RealComponent);

      const LazyComp = lazy(() => Promise.resolve({ default: RealComponent as any }));
      await tick();
      await tick();

      const lazyTag = uniqueTag('lazy-movekids');
      customElements.define(lazyTag, LazyComp);

      const el = document.createElement(lazyTag) as any;
      // Add children before connecting
      const child1 = document.createElement('span');
      child1.textContent = 'Child 1';
      const child2 = document.createElement('span');
      child2.textContent = 'Child 2';
      el.appendChild(child1);
      el.appendChild(child2);

      document.body.appendChild(el);

      const inner = el.querySelector(realTag)!;
      expect(inner.children.length).toBe(2);
      expect(inner.children[0].textContent).toBe('Child 1');
      expect(inner.children[1].textContent).toBe('Child 2');
    });

    it('should not create element when __polyxTagName is not set', async () => {
      class RealComponent extends HTMLElement {
        // no __polyxTagName
      }

      const LazyComp = lazy(() => Promise.resolve({ default: RealComponent as any }));
      await tick();
      await tick();

      const lazyTag = uniqueTag('lazy-notag');
      customElements.define(lazyTag, LazyComp);

      const el = document.createElement(lazyTag) as any;
      document.body.appendChild(el);

      // No child should be created since there is no tagName to create
      expect(el.children.length).toBe(0);
    });
  });
});

// ---- PolyXSuspense ----

describe('PolyXSuspense', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('connectedCallback', () => {
    it('should read fallback attribute and create a textNode', () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      suspense.setAttribute('fallback', 'Loading...');
      document.body.appendChild(suspense);

      // The internal _fallback should be set (we test via _handleSuspend behavior)
      // We cannot access private fields directly, so we verify by triggering suspend
      const child = document.createElement('div');
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      // The fallback clone should appear with text "Loading..."
      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(1);
      expect(fallbackNodes[0].textContent).toBe('Loading...');

      p.resolve();
    });

    it('should handle connectedCallback with no fallback attribute', () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      document.body.appendChild(suspense);

      const child = document.createElement('div');
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      // No fallback node should be appended
      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(0);

      p.resolve();
    });
  });

  describe('fallback setter', () => {
    it('should create a textNode when given a string', () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      document.body.appendChild(suspense);

      suspense.fallback = 'Please wait...';

      // Verify by triggering suspend
      const child = document.createElement('div');
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(1);
      expect(fallbackNodes[0].textContent).toBe('Please wait...');

      p.resolve();
    });

    it('should store a Node directly when given a Node', () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      document.body.appendChild(suspense);

      const fallbackEl = document.createElement('div');
      fallbackEl.textContent = 'Custom fallback';
      suspense.fallback = fallbackEl;

      const child = document.createElement('div');
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(1);
      expect(fallbackNodes[0].textContent).toBe('Custom fallback');

      p.resolve();
    });

    it('should set _fallback to null when given null', () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      document.body.appendChild(suspense);

      // First set a fallback
      suspense.fallback = 'Loading...';
      // Then set to null
      suspense.fallback = null;

      const child = document.createElement('div');
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      // No fallback should be shown
      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(0);

      p.resolve();
    });
  });

  describe('_setProp', () => {
    it('should set fallback via _setProp("fallback", ...)', () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      document.body.appendChild(suspense);

      (suspense as any)._setProp('fallback', 'Loading via prop...');

      const child = document.createElement('div');
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(1);
      expect(fallbackNodes[0].textContent).toBe('Loading via prop...');

      p.resolve();
    });

    it('should not do anything for non-fallback props', () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      document.body.appendChild(suspense);

      // Should not throw or do anything meaningful
      (suspense as any)._setProp('other', 'value');

      const child = document.createElement('div');
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(0);

      p.resolve();
    });
  });

  describe('_setProps', () => {
    it('should set fallback via _setProps({fallback: ...})', () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      document.body.appendChild(suspense);

      (suspense as any)._setProps({ fallback: 'Batch Loading...' });

      const child = document.createElement('div');
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(1);
      expect(fallbackNodes[0].textContent).toBe('Batch Loading...');

      p.resolve();
    });

    it('should ignore props that are not "fallback"', () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      document.body.appendChild(suspense);

      (suspense as any)._setProps({ color: 'red', size: 42 });

      const child = document.createElement('div');
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(0);

      p.resolve();
    });
  });

  describe('_handleSuspend', () => {
    it('should hide children and show fallback', () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      suspense.fallback = 'Loading...';
      document.body.appendChild(suspense);

      const child1 = document.createElement('div');
      child1.textContent = 'Content 1';
      const child2 = document.createElement('div');
      child2.textContent = 'Content 2';
      suspense.appendChild(child1);
      suspense.appendChild(child2);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child1);

      // Children should be hidden
      expect(child1.style.display).toBe('none');
      expect(child2.style.display).toBe('none');

      // Fallback should be visible
      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(1);
      expect(fallbackNodes[0].textContent).toBe('Loading...');

      p.resolve();
    });

    it('should preserve original display style in __polyxSuspenseDisplay', () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      suspense.fallback = 'Loading...';
      document.body.appendChild(suspense);

      const child = document.createElement('div');
      child.style.display = 'flex';
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      expect((child as any).__polyxSuspenseDisplay).toBe('flex');
      expect(child.style.display).toBe('none');

      p.resolve();
    });

    it('should not re-suspend if already suspended', () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      suspense.fallback = 'Loading...';
      document.body.appendChild(suspense);

      const child = document.createElement('div');
      suspense.appendChild(child);

      const p1 = deferred();
      const p2 = deferred();

      (suspense as any)._handleSuspend(p1.promise, child);
      // Already suspended, second call should not re-snapshot or add a second fallback
      (suspense as any)._handleSuspend(p2.promise, child);

      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      // Should still be just 1 fallback
      expect(fallbackNodes.length).toBe(1);

      p1.resolve();
      p2.resolve();
    });

    it('should handle non-HTMLElement childNodes gracefully (text nodes)', () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      suspense.fallback = 'Loading...';
      document.body.appendChild(suspense);

      const textNode = document.createTextNode('Some text');
      const child = document.createElement('div');
      suspense.appendChild(textNode);
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      // Only HTMLElement children should be hidden
      expect(child.style.display).toBe('none');
      // Text node has no style property, it should not throw

      p.resolve();
    });
  });

  describe('promise resolution', () => {
    it('should remove fallback, restore children visibility, and call _updateDynamicParts', async () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      suspense.fallback = 'Loading...';
      document.body.appendChild(suspense);

      const child = document.createElement('div') as any;
      child.textContent = 'Real content';
      child.style.display = 'block';
      child._updateDynamicParts = vi.fn();
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      expect(child.style.display).toBe('none');

      // Resolve the promise
      p.resolve();
      await tick();
      await tick();

      // Fallback should be removed
      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(0);

      // Child should be visible again with original display restored
      expect(child.style.display).toBe('block');

      // _updateDynamicParts should have been called
      expect(child._updateDynamicParts).toHaveBeenCalled();
    });

    it('should restore empty display when original was empty string', async () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      suspense.fallback = 'Loading...';
      document.body.appendChild(suspense);

      const child = document.createElement('div') as any;
      // No explicit display set (defaults to '')
      child._updateDynamicParts = vi.fn();
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      p.resolve();
      await tick();
      await tick();

      expect(child.style.display).toBe('');
    });

    it('should clean up __polyxSuspenseDisplay from children after restore', async () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      suspense.fallback = 'Loading...';
      document.body.appendChild(suspense);

      const child = document.createElement('div') as any;
      child.style.display = 'inline-block';
      child._updateDynamicParts = vi.fn();
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      expect((child as any).__polyxSuspenseDisplay).toBe('inline-block');

      p.resolve();
      await tick();
      await tick();

      expect((child as any).__polyxSuspenseDisplay).toBeUndefined();
    });

    it('should not call _updateDynamicParts if child is disconnected', async () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      suspense.fallback = 'Loading...';
      document.body.appendChild(suspense);

      const child = document.createElement('div') as any;
      child._updateDynamicParts = vi.fn();
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      // Remove the child before resolving
      suspense.removeChild(child);

      p.resolve();
      await tick();
      await tick();

      expect(child._updateDynamicParts).not.toHaveBeenCalled();
    });

    it('should not call _updateDynamicParts if child has no such method', async () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      suspense.fallback = 'Loading...';
      document.body.appendChild(suspense);

      const child = document.createElement('div');
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      // Should not throw when resolving
      p.resolve();
      await tick();
      await tick();

      // No error means success
      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(0);
    });
  });

  describe('multiple promises', () => {
    it('should wait for all promises to resolve before restoring', async () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      suspense.fallback = 'Loading...';
      document.body.appendChild(suspense);

      const child1 = document.createElement('div') as any;
      child1._updateDynamicParts = vi.fn();
      const child2 = document.createElement('div') as any;
      child2._updateDynamicParts = vi.fn();
      suspense.appendChild(child1);
      suspense.appendChild(child2);

      const p1 = deferred();
      const p2 = deferred();

      (suspense as any)._handleSuspend(p1.promise, child1);
      (suspense as any)._handleSuspend(p2.promise, child2);

      // Children should be hidden
      expect(child1.style.display).toBe('none');
      expect(child2.style.display).toBe('none');

      // Resolve first promise
      p1.resolve();
      await tick();
      await tick();

      // Still suspended because p2 is pending
      expect((suspense as any)._isSuspended).toBe(true);
      const stillFallback = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(stillFallback.length).toBe(1);

      // Resolve second promise
      p2.resolve();
      await tick();
      await tick();

      // Now everything should be restored
      expect((suspense as any)._isSuspended).toBe(false);
      const noFallback = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(noFallback.length).toBe(0);

      // Children should be visible
      expect(child1.style.display).toBe('');
      expect(child2.style.display).toBe('');
    });
  });

  describe('promise rejection', () => {
    it('should also trigger cleanup on rejection', async () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      suspense.fallback = 'Loading...';
      document.body.appendChild(suspense);

      const child = document.createElement('div') as any;
      child.style.display = 'block';
      child._updateDynamicParts = vi.fn();
      suspense.appendChild(child);

      const p = deferred();
      (suspense as any)._handleSuspend(p.promise, child);

      expect(child.style.display).toBe('none');

      // Reject the promise
      p.reject(new Error('Network failure'));
      await tick();
      await tick();

      // Fallback should still be removed
      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(0);

      // Children should be restored
      expect(child.style.display).toBe('block');
    });

    it('should restore after rejection even when one of multiple promises rejects', async () => {
      const suspense = document.createElement('polyx-suspense') as PolyXSuspense;
      suspense.fallback = 'Loading...';
      document.body.appendChild(suspense);

      const child1 = document.createElement('div') as any;
      child1._updateDynamicParts = vi.fn();
      const child2 = document.createElement('div') as any;
      child2._updateDynamicParts = vi.fn();
      suspense.appendChild(child1);
      suspense.appendChild(child2);

      const p1 = deferred();
      const p2 = deferred();

      (suspense as any)._handleSuspend(p1.promise, child1);
      (suspense as any)._handleSuspend(p2.promise, child2);

      // Reject first, resolve second
      p1.reject(new Error('fail'));
      await tick();
      await tick();

      // Still suspended
      expect((suspense as any)._isSuspended).toBe(true);

      p2.resolve();
      await tick();
      await tick();

      // Now fully restored
      expect((suspense as any)._isSuspended).toBe(false);
      const fallbackNodes = Array.from(suspense.childNodes).filter(
        (n: any) => n.__polyxFallback
      );
      expect(fallbackNodes.length).toBe(0);
    });
  });

  describe('auto-registration', () => {
    it('should have polyx-suspense registered as a custom element', () => {
      const Ctor = customElements.get('polyx-suspense');
      expect(Ctor).toBeDefined();
      expect(Ctor).toBe(PolyXSuspense);
    });

    it('should create a PolyXSuspense instance with document.createElement', () => {
      const el = document.createElement('polyx-suspense');
      expect(el).toBeInstanceOf(PolyXSuspense);
    });
  });
});
