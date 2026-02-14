import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initHMR, getHMR } from '../hmr.js';
import { PolyXElement, createTemplate, clearTemplateCache } from '../component.js';

beforeEach(() => {
  clearTemplateCache();
  delete (window as any).__POLYX_HMR__;
  document.body.innerHTML = '';
});

afterEach(() => {
  delete (window as any).__POLYX_HMR__;
  document.body.innerHTML = '';
});

describe('initHMR / getHMR', () => {
  it('getHMR() should return null before initHMR() is called', () => {
    expect(getHMR()).toBeNull();
  });

  it('getHMR() should return null when window is undefined', () => {
    // Save the original window reference
    const originalWindow = globalThis.window;
    // Delete window to simulate a non-browser environment (e.g., Node.js / SSR)
    delete (globalThis as any).window;

    try {
      const result = getHMR();
      expect(result).toBeNull();
    } finally {
      // Restore window
      (globalThis as any).window = originalWindow;
    }
  });

  it('initHMR() should create __POLYX_HMR__ on window', () => {
    expect((window as any).__POLYX_HMR__).toBeUndefined();
    initHMR();
    expect((window as any).__POLYX_HMR__).toBeDefined();
    expect((window as any).__POLYX_HMR__).not.toBeNull();
  });

  it('getHMR() should return the HMR instance after initHMR()', () => {
    initHMR();
    const hmr = getHMR();
    expect(hmr).not.toBeNull();
    expect(hmr).toBe((window as any).__POLYX_HMR__);
  });

  it('initHMR() should be idempotent (does not overwrite existing instance)', () => {
    initHMR();
    const first = getHMR();
    initHMR();
    const second = getHMR();
    expect(first).toBe(second);
  });
});

describe('PolyXHMR.register', () => {
  it('should store a component class for a tag name', () => {
    initHMR();
    const hmr = getHMR()!;

    class FakeElement extends HTMLElement {}

    hmr.register('polyx-fake', FakeElement as any);

    // We can verify registration by tracking an instance (would fail silently if not registered)
    // and by doing an update later. For now, just verify no error is thrown.
    expect(() => hmr.trackInstance('polyx-fake', document.createElement('div'))).not.toThrow();
  });
});

describe('PolyXHMR.trackInstance', () => {
  it('should add a WeakRef for the instance under the given tag name', () => {
    initHMR();
    const hmr = getHMR()!;

    class FakeElement extends HTMLElement {}
    hmr.register('polyx-tracked', FakeElement as any);

    const instance = document.createElement('div');
    hmr.trackInstance('polyx-tracked', instance);

    // The instance should be discoverable through an update cycle
    // We verify by doing an update with a matching class
    // For a more direct check, we rely on the update test below.
    expect(() => hmr.trackInstance('polyx-tracked', instance)).not.toThrow();
  });

  it('should silently ignore tracking for unregistered tag names', () => {
    initHMR();
    const hmr = getHMR()!;

    const instance = document.createElement('div');
    // Should not throw even though 'polyx-unknown' is not registered
    expect(() => hmr.trackInstance('polyx-unknown', instance)).not.toThrow();
  });
});

describe('PolyXHMR.update', () => {
  let tagCounter = 0;

  function createTestComponent(renderBody?: (el: any) => void): {
    tagName: string;
    elementClass: typeof PolyXElement;
  } {
    const baseName = `hmrcomp${++tagCounter}`;
    const tagName = `polyx-${baseName}`;
    // Class name must match: tagName without 'polyx-' and '-', plus 'element'
    // e.g. polyx-hmrcomp1 -> hmrcomp1element
    const className = `${baseName}element`;

    // Use dynamic class name via Object.defineProperty
    class TestElement extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');

      _render() {
        if (renderBody) renderBody(this);
        else this._setDynamicValue(0, 'original');
      }
    }
    Object.defineProperty(TestElement, 'name', { value: className });

    try {
      customElements.define(tagName, TestElement);
    } catch {
      // Already defined
    }

    return { tagName, elementClass: TestElement };
  }

  it('should copy new prototype methods to the old class prototype', () => {
    initHMR();
    const hmr = getHMR()!;

    const { tagName, elementClass } = createTestComponent();
    hmr.register(tagName, elementClass as any);

    // Create a "new module" class with an updated method
    const baseName = tagName.replace('polyx-', '').replace(/-/g, '');
    const newClassName = `${baseName}element`;

    class NewVersion extends PolyXElement {
      static template = createTemplate('<div>updated</div>');

      _render() {
        this._setDynamicValue(0, 'updated');
      }

      newMethod() {
        return 'new';
      }
    }
    Object.defineProperty(NewVersion, 'name', { value: newClassName });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    hmr.update({ default: NewVersion });

    // The old prototype should now have the newMethod
    expect(typeof (elementClass.prototype as any).newMethod).toBe('function');
    expect((elementClass.prototype as any).newMethod()).toBe('new');

    // The old prototype's _render should be updated
    expect(elementClass.prototype._render).toBe(NewVersion.prototype._render);

    logSpy.mockRestore();
  });

  it('should copy static properties (like template) from new class to old class', () => {
    initHMR();
    const hmr = getHMR()!;

    const { tagName, elementClass } = createTestComponent();
    hmr.register(tagName, elementClass as any);

    const originalTemplate = (elementClass as any).template;

    const baseName = tagName.replace('polyx-', '').replace(/-/g, '');
    const newClassName = `${baseName}element`;

    class NewVersion extends PolyXElement {
      static template = createTemplate('<div>new template content</div>');
      static customStaticProp = 'hello';

      _render() {
        this._setDynamicValue(0, 'v2');
      }
    }
    Object.defineProperty(NewVersion, 'name', { value: newClassName });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    hmr.update({ default: NewVersion });

    // Static template should be updated
    expect((elementClass as any).template).toBe(NewVersion.template);
    expect((elementClass as any).template).not.toBe(originalTemplate);

    // Custom static property should be copied
    expect((elementClass as any).customStaticProp).toBe('hello');

    logSpy.mockRestore();
  });

  it('should re-render connected instances by calling _updateDynamicParts', () => {
    initHMR();
    const hmr = getHMR()!;

    const { tagName, elementClass } = createTestComponent();
    hmr.register(tagName, elementClass as any);

    // Create and connect an instance
    const el = document.createElement(tagName);
    document.body.appendChild(el);

    // Track the instance
    hmr.trackInstance(tagName, el);

    // Spy on _updateDynamicParts
    const updateSpy = vi.spyOn(el as any, '_updateDynamicParts');

    // Build the new module
    const baseName = tagName.replace('polyx-', '').replace(/-/g, '');
    const newClassName = `${baseName}element`;

    class NewVersion extends PolyXElement {
      static template = createTemplate('<div>v2</div>');
      _render() {
        this._setDynamicValue(0, 'v2');
      }
    }
    Object.defineProperty(NewVersion, 'name', { value: newClassName });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    hmr.update({ default: NewVersion });

    expect(updateSpy).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('should prune disconnected instances (dead WeakRefs)', () => {
    initHMR();
    const hmr = getHMR()!;

    const { tagName, elementClass } = createTestComponent();
    hmr.register(tagName, elementClass as any);

    // Create a connected instance
    const connectedEl = document.createElement(tagName);
    document.body.appendChild(connectedEl);
    hmr.trackInstance(tagName, connectedEl);

    // Create a disconnected instance (not in DOM)
    const disconnectedEl = document.createElement(tagName);
    hmr.trackInstance(tagName, disconnectedEl);
    // disconnectedEl is never appended, so isConnected = false

    const updateSpy = vi.spyOn(connectedEl as any, '_updateDynamicParts');

    const baseName = tagName.replace('polyx-', '').replace(/-/g, '');
    const newClassName = `${baseName}element`;

    class NewVersion extends PolyXElement {
      static template = createTemplate('<div>v2</div>');
      _render() {}
    }
    Object.defineProperty(NewVersion, 'name', { value: newClassName });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    hmr.update({ default: NewVersion });

    // Only the connected instance should have been updated
    expect(updateSpy).toHaveBeenCalled();

    // The disconnected element should have been pruned.
    // We cannot directly inspect the private registry, but we can verify
    // the connected instance was re-rendered (above) and the disconnected was not.
    // We verify by spying on the disconnected element:
    const disconnectedUpdateSpy = vi.spyOn(disconnectedEl as any, '_updateDynamicParts');

    // Do a second update to verify the disconnected instance is no longer tracked
    class NewVersion2 extends PolyXElement {
      static template = createTemplate('<div>v3</div>');
      _render() {}
    }
    Object.defineProperty(NewVersion2, 'name', { value: newClassName });

    hmr.update({ default: NewVersion2 });

    expect(disconnectedUpdateSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('should skip non-class exports (primitive values, plain objects, arrow functions)', () => {
    initHMR();
    const hmr = getHMR()!;

    const { tagName, elementClass } = createTestComponent();
    hmr.register(tagName, elementClass as any);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Module with non-class exports: string, number, object, arrow function (no prototype)
    const arrowFn = () => {};
    // Arrow functions have a prototype of undefined in some envs; manually delete it
    delete (arrowFn as any).prototype;

    hmr.update({
      someString: 'hello',
      someNumber: 42,
      someObject: { a: 1 },
      someArrow: arrowFn,
    });

    // No HMR update log should have been triggered (nothing matched)
    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('should skip function exports that do not match any registered tag name', () => {
    initHMR();
    const hmr = getHMR()!;

    const { tagName, elementClass } = createTestComponent();
    hmr.register(tagName, elementClass as any);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // A class that does NOT match the naming pattern
    class UnrelatedComponent extends PolyXElement {
      static template = createTemplate('<div>unrelated</div>');
      _render() {}
    }

    hmr.update({ default: UnrelatedComponent });

    // Should not trigger any HMR update
    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('should handle modules with multiple exports, updating only matching ones', () => {
    initHMR();
    const hmr = getHMR()!;

    // Register two components
    const comp1 = createTestComponent();
    hmr.register(comp1.tagName, comp1.elementClass as any);
    const comp2 = createTestComponent();
    hmr.register(comp2.tagName, comp2.elementClass as any);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Create new versions only for comp1
    const baseName1 = comp1.tagName.replace('polyx-', '').replace(/-/g, '');
    const newClassName1 = `${baseName1}element`;

    class NewComp1 extends PolyXElement {
      static template = createTemplate('<div>comp1-v2</div>');
      _render() {}
      addedMethod() { return 'comp1-new'; }
    }
    Object.defineProperty(NewComp1, 'name', { value: newClassName1 });

    // Also include a non-matching export
    class SomethingElse extends PolyXElement {
      static template = createTemplate('<div>else</div>');
      _render() {}
    }

    hmr.update({
      Comp1: NewComp1,
      Other: SomethingElse,
      version: '2.0',
    });

    // Only comp1 should be updated
    expect((comp1.elementClass.prototype as any).addedMethod).toBeDefined();
    expect((comp1.elementClass.prototype as any).addedMethod()).toBe('comp1-new');

    // comp2 should NOT have the addedMethod
    expect((comp2.elementClass.prototype as any).addedMethod).toBeUndefined();

    // Only one update log (for comp1)
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(comp1.tagName));

    logSpy.mockRestore();
  });
});

describe('findTagName matching', () => {
  it('should match polyx-counter to class named counterelement', () => {
    initHMR();
    const hmr = getHMR()!;

    class CounterElement extends PolyXElement {
      static template = createTemplate('<div>count</div>');
      _render() {}
    }
    Object.defineProperty(CounterElement, 'name', { value: 'counterelement' });

    const tagName = 'polyx-counter';
    try {
      customElements.define(tagName, CounterElement);
    } catch {
      // Already defined
    }
    hmr.register(tagName, CounterElement as any);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // New version with matching name
    class NewCounterElement extends PolyXElement {
      static template = createTemplate('<div>count-v2</div>');
      _render() {}
      newFeature() { return true; }
    }
    Object.defineProperty(NewCounterElement, 'name', { value: 'counterelement' });

    hmr.update({ Counter: NewCounterElement });

    // Should have matched and updated
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('polyx-counter'));
    expect((CounterElement.prototype as any).newFeature).toBeDefined();

    logSpy.mockRestore();
  });

  it('should match polyx-my-app to class named myappelement', () => {
    initHMR();
    const hmr = getHMR()!;

    class MyAppElement extends PolyXElement {
      static template = createTemplate('<div>app</div>');
      _render() {}
    }
    Object.defineProperty(MyAppElement, 'name', { value: 'myappelement' });

    const tagName = 'polyx-my-app';
    try {
      customElements.define(tagName, MyAppElement);
    } catch {
      // Already defined
    }
    hmr.register(tagName, MyAppElement as any);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    class NewMyAppElement extends PolyXElement {
      static template = createTemplate('<div>app-v2</div>');
      _render() {}
      updated() { return 'yes'; }
    }
    Object.defineProperty(NewMyAppElement, 'name', { value: 'myappelement' });

    hmr.update({ MyApp: NewMyAppElement });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('polyx-my-app'));
    expect((MyAppElement.prototype as any).updated).toBeDefined();
    expect((MyAppElement.prototype as any).updated()).toBe('yes');

    logSpy.mockRestore();
  });

  it('should return null for a class that does not match any registered tag', () => {
    initHMR();
    const hmr = getHMR()!;

    const tagName = 'polyx-widget';
    class WidgetElement extends PolyXElement {
      static template = createTemplate('<div>widget</div>');
      _render() {}
    }
    Object.defineProperty(WidgetElement, 'name', { value: 'widgetelement' });

    try {
      customElements.define(tagName, WidgetElement);
    } catch {
      // Already defined
    }
    hmr.register(tagName, WidgetElement as any);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // A class with a completely different name
    class TotallyDifferentElement extends PolyXElement {
      static template = createTemplate('<div>different</div>');
      _render() {}
    }
    Object.defineProperty(TotallyDifferentElement, 'name', { value: 'totallydifferentelement' });

    hmr.update({ Different: TotallyDifferentElement });

    // Should not match
    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('should match case-insensitively', () => {
    initHMR();
    const hmr = getHMR()!;

    class ItemElement extends PolyXElement {
      static template = createTemplate('<div>item</div>');
      _render() {}
    }
    // Class name uses mixed case but findTagName lowercases for comparison
    Object.defineProperty(ItemElement, 'name', { value: 'ItemElement' });

    const tagName = 'polyx-item';
    try {
      customElements.define(tagName, ItemElement);
    } catch {
      // Already defined
    }
    hmr.register(tagName, ItemElement as any);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    class NewItemElement extends PolyXElement {
      static template = createTemplate('<div>item-v2</div>');
      _render() {}
    }
    Object.defineProperty(NewItemElement, 'name', { value: 'ItemElement' });

    hmr.update({ Item: NewItemElement });

    // Should match because lowercase('ItemElement') === 'itemelement' === 'item' + 'element'
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('polyx-item'));

    logSpy.mockRestore();
  });
});

describe('HMR integration with PolyXElement connectedCallback', () => {
  it('should auto-track instances when HMR is active and element connects', () => {
    initHMR();
    const hmr = getHMR()!;

    let tagCounter = 900;
    const baseName = `hmrint${++tagCounter}`;
    const tagName = `polyx-${baseName}`;
    const className = `${baseName}element`;

    class TestEl extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');
      _render() {
        this._setDynamicValue(0, 'tracked');
      }
    }
    Object.defineProperty(TestEl, 'name', { value: className });

    try {
      customElements.define(tagName, TestEl);
    } catch {
      // Already defined
    }
    hmr.register(tagName, TestEl as any);

    // Create and connect
    const el = document.createElement(tagName);
    document.body.appendChild(el);

    // Now perform an HMR update — the connected instance should be re-rendered
    const updateSpy = vi.spyOn(el as any, '_updateDynamicParts');

    class NewTestEl extends PolyXElement {
      static template = createTemplate('<div>v2</div>');
      _render() {}
    }
    Object.defineProperty(NewTestEl, 'name', { value: className });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    hmr.update({ default: NewTestEl });

    expect(updateSpy).toHaveBeenCalled();

    logSpy.mockRestore();
  });
});
