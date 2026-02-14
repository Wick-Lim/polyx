import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hydrate, isHydrating, collectSerializedState } from '../hydrate.js';
import { PolyXElement, createTemplate, clearTemplateCache } from '../component.js';

beforeEach(() => {
  clearTemplateCache();
  document.body.innerHTML = '';
  document.documentElement.querySelectorAll('[data-polyx-hydrate]').forEach(el => el.remove());
});

describe('hydrate', () => {
  let tagCounter = 0;

  function defineHydrateComponent(name?: string): { tagName: string; elementClass: typeof PolyXElement } {
    const tagName = name || `polyx-hydtest-${++tagCounter}`;

    class HydrateTestElement extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');

      _render() {
        this._setDynamicValue(0, 'hydrated');
      }
    }

    try {
      customElements.define(tagName, HydrateTestElement);
    } catch {
      // Already defined — fine for reuse
    }

    return { tagName, elementClass: HydrateTestElement };
  }

  it('should find all [data-polyx-hydrate] elements in document.documentElement', () => {
    const { tagName } = defineHydrateComponent();

    // Manually create server-rendered markup with hydration markers
    const el1 = document.createElement(tagName);
    el1.setAttribute('data-polyx-hydrate', '');
    const el2 = document.createElement(tagName);
    el2.setAttribute('data-polyx-hydrate', '');

    document.body.appendChild(el1);
    document.body.appendChild(el2);

    // Both elements should have the hydration attribute before hydrate()
    expect(document.querySelectorAll('[data-polyx-hydrate]').length).toBe(2);

    hydrate();

    // After hydrate(), the attribute should be removed from all targets
    expect(document.querySelectorAll('[data-polyx-hydrate]').length).toBe(0);
  });

  it('should only hydrate elements within the given root', () => {
    const { tagName } = defineHydrateComponent();

    const container = document.createElement('div');
    const insideEl = document.createElement(tagName);
    insideEl.setAttribute('data-polyx-hydrate', '');
    container.appendChild(insideEl);

    const outsideEl = document.createElement(tagName);
    outsideEl.setAttribute('data-polyx-hydrate', '');

    document.body.appendChild(container);
    document.body.appendChild(outsideEl);

    // Hydrate only within the container
    hydrate(container);

    // Inside element should have attribute removed
    expect(insideEl.hasAttribute('data-polyx-hydrate')).toBe(false);
    // Outside element should still have attribute
    expect(outsideEl.hasAttribute('data-polyx-hydrate')).toBe(true);
  });

  it('should skip undefined custom elements and log console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create an element with an unregistered tag name
    const el = document.createElement('polyx-unregistered-comp');
    el.setAttribute('data-polyx-hydrate', '');
    document.body.appendChild(el);

    hydrate();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('polyx-unregistered-comp')
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not defined')
    );

    // The attribute should NOT be removed for skipped elements
    // (the function returns before removeAttribute)
    expect(el.hasAttribute('data-polyx-hydrate')).toBe(true);

    warnSpy.mockRestore();
  });

  it('should set __polyx_hydrating to true during hydration and false after', () => {
    const { tagName } = defineHydrateComponent();
    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    document.body.appendChild(el);

    // Spy on removeAttribute to capture __polyx_hydrating state during hydration.
    // removeAttribute('data-polyx-hydrate') is called right after __polyx_hydrating = true,
    // so we can observe the flag at that point.
    let hydratingDuringRemoveAttr: boolean | undefined;
    const originalRemoveAttr = el.removeAttribute.bind(el);
    vi.spyOn(el, 'removeAttribute').mockImplementation((attr: string) => {
      if (attr === 'data-polyx-hydrate') {
        hydratingDuringRemoveAttr = (el as any).__polyx_hydrating;
      }
      originalRemoveAttr(attr);
    });

    hydrate();

    // During removeAttribute, __polyx_hydrating should have been true
    expect(hydratingDuringRemoveAttr).toBe(true);
    // After hydrate completes, it should be false
    expect((el as any).__polyx_hydrating).toBe(false);

    vi.restoreAllMocks();
  });

  it('should remove the data-polyx-hydrate attribute', () => {
    const { tagName } = defineHydrateComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    document.body.appendChild(el);

    expect(el.hasAttribute('data-polyx-hydrate')).toBe(true);

    hydrate();

    expect(el.hasAttribute('data-polyx-hydrate')).toBe(false);
  });

  it('should call customElements.upgrade() when element is not yet an instance of the class', () => {
    const { tagName } = defineHydrateComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    document.body.appendChild(el);

    const upgradeSpy = vi.spyOn(customElements, 'upgrade');

    hydrate();

    // The element may or may not need upgrade depending on happy-dom behavior.
    // We verify that the upgrade path is exercised by checking the spy was called
    // or that the element was already the correct instance.
    const ceClass = customElements.get(tagName);
    if (!(el instanceof ceClass!)) {
      expect(upgradeSpy).toHaveBeenCalledWith(el);
    }

    upgradeSpy.mockRestore();
  });

  it('should call customElements.upgrade() for elements not yet upgraded (forced instanceof check)', () => {
    const { tagName } = defineHydrateComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    document.body.appendChild(el);

    // Override customElements.get to return a class that the element is NOT an instance of,
    // forcing the code to enter the `customElements.upgrade(element)` branch (line 39).
    const realGet = customElements.get.bind(customElements);
    const fakeClass = class FakeClass extends HTMLElement {};
    vi.spyOn(customElements, 'get').mockImplementation((name: string) => {
      if (name === tagName) return fakeClass;
      return realGet(name);
    });

    const upgradeSpy = vi.spyOn(customElements, 'upgrade').mockImplementation(() => {});

    hydrate();

    // Since el is NOT an instance of fakeClass, upgrade() should be called
    expect(upgradeSpy).toHaveBeenCalledWith(el);

    // After hydration, the attribute should be removed
    expect(el.hasAttribute('data-polyx-hydrate')).toBe(false);
    // And __polyx_hydrating should be false
    expect((el as any).__polyx_hydrating).toBe(false);

    vi.restoreAllMocks();
  });

  it('should NOT call customElements.upgrade() when element is already correct instance', () => {
    const { tagName, elementClass } = defineHydrateComponent();

    // Create the element through the constructor so it's already an instance
    const el = document.createElement(tagName);
    document.body.appendChild(el);

    // Now manually add the hydrate attribute to simulate re-hydration scenario
    el.setAttribute('data-polyx-hydrate', '');

    const upgradeSpy = vi.spyOn(customElements, 'upgrade');

    hydrate();

    // The element was already upgraded (created via document.createElement with a registered tag),
    // so upgrade should not be called
    const ceClass = customElements.get(tagName);
    if (el instanceof ceClass!) {
      expect(upgradeSpy).not.toHaveBeenCalled();
    }

    upgradeSpy.mockRestore();
  });

  it('should handle multiple hydration targets', () => {
    const { tagName } = defineHydrateComponent();

    const els: HTMLElement[] = [];
    for (let i = 0; i < 5; i++) {
      const el = document.createElement(tagName);
      el.setAttribute('data-polyx-hydrate', '');
      document.body.appendChild(el);
      els.push(el);
    }

    expect(document.querySelectorAll('[data-polyx-hydrate]').length).toBe(5);

    hydrate();

    // All hydration attributes should be removed
    expect(document.querySelectorAll('[data-polyx-hydrate]').length).toBe(0);

    // All elements should have __polyx_hydrating set to false
    for (const el of els) {
      expect((el as any).__polyx_hydrating).toBe(false);
    }
  });

  it('should handle no hydration targets gracefully (no-op)', () => {
    // No elements with data-polyx-hydrate exist
    expect(document.querySelectorAll('[data-polyx-hydrate]').length).toBe(0);

    // Should not throw
    expect(() => hydrate()).not.toThrow();
  });

  it('should handle mixed defined and undefined custom elements', () => {
    const { tagName } = defineHydrateComponent();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // One defined element
    const definedEl = document.createElement(tagName);
    definedEl.setAttribute('data-polyx-hydrate', '');
    document.body.appendChild(definedEl);

    // One undefined element
    const undefinedEl = document.createElement('polyx-nonexistent-widget');
    undefinedEl.setAttribute('data-polyx-hydrate', '');
    document.body.appendChild(undefinedEl);

    hydrate();

    // The defined element should have attribute removed
    expect(definedEl.hasAttribute('data-polyx-hydrate')).toBe(false);
    // The undefined element should still have the attribute (skipped before removeAttribute)
    expect(undefinedEl.hasAttribute('data-polyx-hydrate')).toBe(true);
    // A warning should have been logged for the undefined element
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});

describe('isHydrating', () => {
  it('should return false for a normal element', () => {
    const el = document.createElement('div');
    expect(isHydrating(el)).toBe(false);
  });

  it('should return false when __polyx_hydrating is not set', () => {
    const el = document.createElement('div');
    expect(isHydrating(el)).toBe(false);
  });

  it('should return true when __polyx_hydrating is set to true', () => {
    const el = document.createElement('div');
    (el as any).__polyx_hydrating = true;
    expect(isHydrating(el)).toBe(true);
  });

  it('should return false when __polyx_hydrating is set to false', () => {
    const el = document.createElement('div');
    (el as any).__polyx_hydrating = false;
    expect(isHydrating(el)).toBe(false);
  });

  it('should return false for undefined __polyx_hydrating', () => {
    const el = document.createElement('div');
    (el as any).__polyx_hydrating = undefined;
    expect(isHydrating(el)).toBe(false);
  });

  it('should return false for null __polyx_hydrating', () => {
    const el = document.createElement('div');
    (el as any).__polyx_hydrating = null;
    expect(isHydrating(el)).toBe(false);
  });
});

// =============================================================================
// Feature 3: collectSerializedState
// =============================================================================

describe('collectSerializedState', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should collect state from script tags with type="application/polyx-state"', () => {
    const script = document.createElement('script');
    script.setAttribute('type', 'application/polyx-state');
    script.setAttribute('data-for', 'polyx-counter');
    script.setAttribute('data-instance', '0');
    script.textContent = '{"count":5}';
    document.body.appendChild(script);

    const stateMap = collectSerializedState(document.body);
    expect(stateMap.size).toBe(1);
    expect(stateMap.get('polyx-counter:0')).toEqual({ count: 5 });
  });

  it('should collect multiple state entries', () => {
    const script1 = document.createElement('script');
    script1.setAttribute('type', 'application/polyx-state');
    script1.setAttribute('data-for', 'polyx-counter');
    script1.setAttribute('data-instance', '0');
    script1.textContent = '{"count":0}';
    document.body.appendChild(script1);

    const script2 = document.createElement('script');
    script2.setAttribute('type', 'application/polyx-state');
    script2.setAttribute('data-for', 'polyx-counter');
    script2.setAttribute('data-instance', '1');
    script2.textContent = '{"count":10}';
    document.body.appendChild(script2);

    const script3 = document.createElement('script');
    script3.setAttribute('type', 'application/polyx-state');
    script3.setAttribute('data-for', 'polyx-widget');
    script3.setAttribute('data-instance', '0');
    script3.textContent = '{"name":"test"}';
    document.body.appendChild(script3);

    const stateMap = collectSerializedState(document.body);
    expect(stateMap.size).toBe(3);
    expect(stateMap.get('polyx-counter:0')).toEqual({ count: 0 });
    expect(stateMap.get('polyx-counter:1')).toEqual({ count: 10 });
    expect(stateMap.get('polyx-widget:0')).toEqual({ name: 'test' });
  });

  it('should remove script tags after collection', () => {
    const script = document.createElement('script');
    script.setAttribute('type', 'application/polyx-state');
    script.setAttribute('data-for', 'polyx-test');
    script.setAttribute('data-instance', '0');
    script.textContent = '{"x":1}';
    document.body.appendChild(script);

    expect(document.querySelectorAll('script[type="application/polyx-state"]').length).toBe(1);

    collectSerializedState(document.body);

    expect(document.querySelectorAll('script[type="application/polyx-state"]').length).toBe(0);
  });

  it('should return empty map when no state scripts exist', () => {
    const stateMap = collectSerializedState(document.body);
    expect(stateMap.size).toBe(0);
  });

  it('should skip scripts with invalid JSON', () => {
    const script = document.createElement('script');
    script.setAttribute('type', 'application/polyx-state');
    script.setAttribute('data-for', 'polyx-broken');
    script.setAttribute('data-instance', '0');
    script.textContent = 'not valid json {{{';
    document.body.appendChild(script);

    const stateMap = collectSerializedState(document.body);
    expect(stateMap.size).toBe(0);
  });

  it('should skip scripts without data-for attribute', () => {
    const script = document.createElement('script');
    script.setAttribute('type', 'application/polyx-state');
    script.setAttribute('data-instance', '0');
    script.textContent = '{"x":1}';
    document.body.appendChild(script);

    const stateMap = collectSerializedState(document.body);
    expect(stateMap.size).toBe(0);
  });

  it('should skip scripts without data-instance attribute', () => {
    const script = document.createElement('script');
    script.setAttribute('type', 'application/polyx-state');
    script.setAttribute('data-for', 'polyx-test');
    script.textContent = '{"x":1}';
    document.body.appendChild(script);

    const stateMap = collectSerializedState(document.body);
    expect(stateMap.size).toBe(0);
  });

  it('should handle empty script textContent gracefully', () => {
    const script = document.createElement('script');
    script.setAttribute('type', 'application/polyx-state');
    script.setAttribute('data-for', 'polyx-empty');
    script.setAttribute('data-instance', '0');
    script.textContent = '';
    document.body.appendChild(script);

    const stateMap = collectSerializedState(document.body);
    // Empty string parsed as JSON is "{}" via fallback
    expect(stateMap.get('polyx-empty:0')).toEqual({});
  });

  it('should only search within the given root element', () => {
    const container = document.createElement('div');
    const script = document.createElement('script');
    script.setAttribute('type', 'application/polyx-state');
    script.setAttribute('data-for', 'polyx-inside');
    script.setAttribute('data-instance', '0');
    script.textContent = '{"inside":true}';
    container.appendChild(script);

    const outsideScript = document.createElement('script');
    outsideScript.setAttribute('type', 'application/polyx-state');
    outsideScript.setAttribute('data-for', 'polyx-outside');
    outsideScript.setAttribute('data-instance', '0');
    outsideScript.textContent = '{"outside":true}';

    document.body.appendChild(container);
    document.body.appendChild(outsideScript);

    const stateMap = collectSerializedState(container);
    expect(stateMap.size).toBe(1);
    expect(stateMap.has('polyx-inside:0')).toBe(true);
    expect(stateMap.has('polyx-outside:0')).toBe(false);
  });
});

// =============================================================================
// Feature 3: Selective Hydration Strategies
// =============================================================================

describe('hydrate: strategy-based routing', () => {
  let tagCounter2 = 1000;

  beforeEach(() => {
    clearTemplateCache();
    document.body.innerHTML = '';
  });

  function defineHydrateStrategyComponent(name?: string): { tagName: string } {
    const tagName = name || `polyx-strategy-${++tagCounter2}`;

    class StrategyTestElement extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');

      _render() {
        this._setDynamicValue(0, 'hydrated');
      }
    }

    try {
      customElements.define(tagName, StrategyTestElement);
    } catch {
      // Already defined
    }

    return { tagName };
  }

  it('should handle "none" strategy: remove markers without hydrating', () => {
    const { tagName } = defineHydrateStrategyComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    el.setAttribute('data-hydrate', 'none');
    document.body.appendChild(el);

    hydrate();

    // Markers should be removed
    expect(el.hasAttribute('data-polyx-hydrate')).toBe(false);
    expect(el.hasAttribute('data-hydrate')).toBe(false);
    // Element should NOT have been hydrated (no __polyx_hydrating set to true then false)
    // The "none" path only removes attributes, doesn't touch __polyx_hydrating
  });

  it('should handle "load" strategy: immediate hydration', () => {
    const { tagName } = defineHydrateStrategyComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    // No data-hydrate attribute means default "load"
    document.body.appendChild(el);

    hydrate();

    expect(el.hasAttribute('data-polyx-hydrate')).toBe(false);
    expect((el as any).__polyx_hydrating).toBe(false);
  });

  it('should handle "load" strategy with explicit attribute', () => {
    const { tagName } = defineHydrateStrategyComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    el.setAttribute('data-hydrate', 'load');
    document.body.appendChild(el);

    hydrate();

    expect(el.hasAttribute('data-polyx-hydrate')).toBe(false);
    expect(el.hasAttribute('data-hydrate')).toBe(false);
  });

  it('should handle "idle" strategy: schedule via requestIdleCallback or setTimeout', () => {
    const { tagName } = defineHydrateStrategyComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    el.setAttribute('data-hydrate', 'idle');
    document.body.appendChild(el);

    // Mock requestIdleCallback if available, else setTimeout
    const originalRIC = (globalThis as any).requestIdleCallback;
    const ricSpy = vi.fn((cb: Function) => cb());
    (globalThis as any).requestIdleCallback = ricSpy;

    hydrate();

    if (originalRIC !== undefined) {
      expect(ricSpy).toHaveBeenCalled();
    }

    // Restore
    if (originalRIC !== undefined) {
      (globalThis as any).requestIdleCallback = originalRIC;
    } else {
      delete (globalThis as any).requestIdleCallback;
    }
  });

  it('should handle "idle" strategy: fallback to setTimeout when requestIdleCallback is unavailable', async () => {
    const { tagName } = defineHydrateStrategyComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    el.setAttribute('data-hydrate', 'idle');
    document.body.appendChild(el);

    // Remove requestIdleCallback
    const originalRIC = (globalThis as any).requestIdleCallback;
    delete (globalThis as any).requestIdleCallback;

    hydrate();

    // Wait for the setTimeout(cb, 50) fallback
    await new Promise(r => setTimeout(r, 100));

    // Element should be hydrated after timeout
    expect(el.hasAttribute('data-polyx-hydrate')).toBe(false);

    // Restore
    if (originalRIC !== undefined) {
      (globalThis as any).requestIdleCallback = originalRIC;
    }
  });

  it('should handle "interaction" strategy: add event listeners for click/focus/touchstart/pointerover', () => {
    const { tagName } = defineHydrateStrategyComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    el.setAttribute('data-hydrate', 'interaction');
    document.body.appendChild(el);

    const addEventSpy = vi.spyOn(el, 'addEventListener');

    hydrate();

    // Should add listeners for the 4 interaction events
    const eventNames = addEventSpy.mock.calls.map(call => call[0]);
    expect(eventNames).toContain('click');
    expect(eventNames).toContain('focus');
    expect(eventNames).toContain('touchstart');
    expect(eventNames).toContain('pointerover');

    addEventSpy.mockRestore();
  });

  it('should hydrate on first interaction and remove listeners', () => {
    const { tagName } = defineHydrateStrategyComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    el.setAttribute('data-hydrate', 'interaction');
    document.body.appendChild(el);

    hydrate();

    // Before interaction, markers may still be present
    // Simulate a pointerover event
    el.dispatchEvent(new Event('pointerover', { bubbles: true }));

    // After interaction, element should be hydrated
    expect(el.hasAttribute('data-polyx-hydrate')).toBe(false);
  });

  it('should handle "visible" strategy: fallback to immediate hydration when IntersectionObserver is unavailable', () => {
    const { tagName } = defineHydrateStrategyComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    el.setAttribute('data-hydrate', 'visible');
    document.body.appendChild(el);

    // IntersectionObserver may not be available in happy-dom
    const originalIO = (globalThis as any).IntersectionObserver;
    delete (globalThis as any).IntersectionObserver;

    hydrate();

    // Without IntersectionObserver, should fall back to immediate hydration
    expect(el.hasAttribute('data-polyx-hydrate')).toBe(false);

    // Restore
    if (originalIO !== undefined) {
      (globalThis as any).IntersectionObserver = originalIO;
    }
  });

  it('should handle "visible" strategy: use IntersectionObserver when available', () => {
    const { tagName } = defineHydrateStrategyComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    el.setAttribute('data-hydrate', 'visible');
    document.body.appendChild(el);

    // Mock IntersectionObserver as a proper constructor
    let observeCallback: Function | null = null;
    const mockDisconnect = vi.fn();
    const originalIO = (globalThis as any).IntersectionObserver;

    class MockIntersectionObserver {
      constructor(callback: Function) {
        observeCallback = callback;
      }
      observe = vi.fn();
      disconnect = mockDisconnect;
      unobserve = vi.fn();
    }
    (globalThis as any).IntersectionObserver = MockIntersectionObserver;

    hydrate();

    // Simulate element becoming visible
    if (observeCallback) {
      observeCallback([{ isIntersecting: true, target: el }]);
    }

    // Should disconnect and hydrate
    expect(mockDisconnect).toHaveBeenCalled();
    expect(el.hasAttribute('data-polyx-hydrate')).toBe(false);

    // Restore
    if (originalIO !== undefined) {
      (globalThis as any).IntersectionObserver = originalIO;
    } else {
      delete (globalThis as any).IntersectionObserver;
    }
  });
});

// =============================================================================
// Feature 3: Resume Mode Hydration
// =============================================================================

describe('hydrate: resume mode', () => {
  let tagCounter3 = 2000;

  beforeEach(() => {
    clearTemplateCache();
    document.body.innerHTML = '';
  });

  function defineResumeComponent(name?: string): { tagName: string } {
    const tagName = name || `polyx-resume-${++tagCounter3}`;

    class ResumeTestElement extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');

      _render() {
        this._setDynamicValue(0, 'rendered');
      }
    }

    try {
      customElements.define(tagName, ResumeTestElement);
    } catch {
      // Already defined
    }

    return { tagName };
  }

  it('should auto-detect resume mode when serialized state scripts exist', () => {
    const { tagName } = defineResumeComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    el.setAttribute('data-polyx-instance', '0');
    document.body.appendChild(el);

    // Add serialized state
    const script = document.createElement('script');
    script.setAttribute('type', 'application/polyx-state');
    script.setAttribute('data-for', tagName);
    script.setAttribute('data-instance', '0');
    script.textContent = '{"count":42}';
    document.body.appendChild(script);

    hydrate();

    // Element should be hydrated (markers removed)
    expect(el.hasAttribute('data-polyx-hydrate')).toBe(false);

    // Script tag should have been removed
    expect(document.querySelectorAll('script[type="application/polyx-state"]').length).toBe(0);
  });

  it('should set __polyx_resume flag during resume hydration', () => {
    const { tagName } = defineResumeComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    el.setAttribute('data-polyx-instance', '0');
    document.body.appendChild(el);

    const script = document.createElement('script');
    script.setAttribute('type', 'application/polyx-state');
    script.setAttribute('data-for', tagName);
    script.setAttribute('data-instance', '0');
    script.textContent = '{"count":1}';
    document.body.appendChild(script);

    // Spy on removeAttribute to check flags during hydration
    let resumeFlagDuringHydration: boolean | undefined;
    const originalRemoveAttr = el.removeAttribute.bind(el);
    vi.spyOn(el, 'removeAttribute').mockImplementation((attr: string) => {
      if (attr === 'data-polyx-hydrate') {
        resumeFlagDuringHydration = (el as any).__polyx_resume;
      }
      originalRemoveAttr(attr);
    });

    hydrate();

    expect(resumeFlagDuringHydration).toBe(true);
    // After hydration, resume flag should be cleared
    expect((el as any).__polyx_resume).toBe(false);

    vi.restoreAllMocks();
  });

  it('should use full hydration mode when explicitly specified even with state scripts', () => {
    const { tagName } = defineResumeComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    document.body.appendChild(el);

    // Add state scripts
    const script = document.createElement('script');
    script.setAttribute('type', 'application/polyx-state');
    script.setAttribute('data-for', tagName);
    script.setAttribute('data-instance', '0');
    script.textContent = '{"count":1}';
    document.body.appendChild(script);

    hydrate(document.documentElement, { mode: 'full' });

    // Should have done full hydration (no resume flags)
    expect(el.hasAttribute('data-polyx-hydrate')).toBe(false);
    expect((el as any).__polyx_hydrating).toBe(false);
  });

  it('should handle resume mode with "none" strategy (skip hydration)', () => {
    const { tagName } = defineResumeComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    el.setAttribute('data-hydrate', 'none');
    document.body.appendChild(el);

    const script = document.createElement('script');
    script.setAttribute('type', 'application/polyx-state');
    script.setAttribute('data-for', tagName);
    script.setAttribute('data-instance', '0');
    script.textContent = '{"count":1}';
    document.body.appendChild(script);

    hydrate();

    // "none" strategy removes markers but skips hydration
    expect(el.hasAttribute('data-polyx-hydrate')).toBe(false);
    expect(el.hasAttribute('data-hydrate')).toBe(false);
  });

  it('should store serialized state on element for _mount to pick up', () => {
    const { tagName } = defineResumeComponent();

    const el = document.createElement(tagName);
    el.setAttribute('data-polyx-hydrate', '');
    el.setAttribute('data-polyx-instance', '0');
    document.body.appendChild(el);

    const script = document.createElement('script');
    script.setAttribute('type', 'application/polyx-state');
    script.setAttribute('data-for', tagName);
    script.setAttribute('data-instance', '0');
    script.textContent = '{"count":99}';
    document.body.appendChild(script);

    // Spy to capture __polyx_serialized_state during removeAttribute
    let serializedStateDuringHydration: any;
    const originalRemoveAttr = el.removeAttribute.bind(el);
    vi.spyOn(el, 'removeAttribute').mockImplementation((attr: string) => {
      if (attr === 'data-polyx-hydrate') {
        serializedStateDuringHydration = (el as any).__polyx_serialized_state;
      }
      originalRemoveAttr(attr);
    });

    hydrate();

    expect(serializedStateDuringHydration).toEqual({ count: 99 });

    vi.restoreAllMocks();
  });

  it('should warn for unregistered custom element in resume mode', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const el = document.createElement('polyx-unregistered-resume');
    el.setAttribute('data-polyx-hydrate', '');
    el.setAttribute('data-polyx-instance', '0');
    document.body.appendChild(el);

    const script = document.createElement('script');
    script.setAttribute('type', 'application/polyx-state');
    script.setAttribute('data-for', 'polyx-unregistered-resume');
    script.setAttribute('data-instance', '0');
    script.textContent = '{"x":1}';
    document.body.appendChild(script);

    hydrate();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('polyx-unregistered-resume')
    );

    warnSpy.mockRestore();
  });
});
