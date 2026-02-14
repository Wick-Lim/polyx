import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hydrate, isHydrating } from '../hydrate.js';
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
