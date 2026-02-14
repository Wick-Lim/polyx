import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PolyXElement, createTemplate, clearTemplateCache } from '../component.js';
import { setCurrentInstance } from '../hooks-internals.js';
import { startTransition } from '../scheduler.js';

beforeEach(() => {
  clearTemplateCache();
});

describe('createTemplate', () => {
  it('should create a template element from HTML', () => {
    const template = createTemplate('<div>hello</div>');
    expect(template).toBeInstanceOf(HTMLTemplateElement);
    expect(template.content.firstElementChild?.tagName).toBe('DIV');
  });

  it('should cache templates', () => {
    const t1 = createTemplate('<div>a</div>');
    const t2 = createTemplate('<div>a</div>');
    expect(t1).toBe(t2);
  });

  it('should clear cache', () => {
    const t1 = createTemplate('<div>a</div>');
    clearTemplateCache();
    const t2 = createTemplate('<div>a</div>');
    expect(t1).not.toBe(t2);
  });
});

describe('PolyXElement', () => {
  let tagCounter = 0;

  function defineTestComponent(
    renderFn: (el: any) => void,
    templateHTML: string,
    name?: string
  ): string {
    const tagName = name || `test-el-${++tagCounter}`;

    class TestElement extends PolyXElement {
      static template = createTemplate(templateHTML);

      _render() {
        renderFn(this);
      }
    }

    customElements.define(tagName, TestElement);
    return tagName;
  }

  it('should mount with template', async () => {
    const tagName = defineTestComponent(
      () => {},
      '<div>Hello World</div>'
    );

    const el = document.createElement(tagName);
    document.body.appendChild(el);

    expect(el.innerHTML).toContain('Hello World');
    document.body.removeChild(el);
  });

  it('should replace dynamic markers with comment nodes', async () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicValue(0, 'test value');
      },
      '<div><span data-dyn="0"></span></div>'
    );

    const el = document.createElement(tagName);
    document.body.appendChild(el);

    expect(el.textContent).toContain('test value');
    document.body.removeChild(el);
  });

  it('should update dynamic text without replacing node', async () => {
    let count = 0;
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicValue(0, `count: ${count}`);
      },
      '<div><span data-dyn="0"></span></div>'
    );

    const el = document.createElement(tagName);
    document.body.appendChild(el);

    expect(el.textContent).toContain('count: 0');

    // Simulate state update
    count = 5;
    el._updateDynamicParts();
    // Wait for microtask (batching)
    await new Promise(r => queueMicrotask(r));

    expect(el.textContent).toContain('count: 5');
    document.body.removeChild(el);
  });

  it('should handle falsy dynamic values as comment nodes', async () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicValue(0, false);
      },
      '<div><span data-dyn="0"></span></div>'
    );

    const el = document.createElement(tagName);
    document.body.appendChild(el);

    // Should not show 'false' as text
    expect(el.textContent?.trim()).not.toContain('false');
    document.body.removeChild(el);
  });

  it('should handle dynamic attributes', async () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicAttribute(0, 'checked', true);
      },
      '<input data-attr-checked="0" />'
    );

    const el = document.createElement(tagName);
    document.body.appendChild(el);

    const input = el.querySelector('input');
    expect(input?.hasAttribute('checked')).toBe(true);
    document.body.removeChild(el);
  });

  it('should remove attribute when value is false', async () => {
    let isChecked = true;
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicAttribute(0, 'disabled', isChecked);
      },
      '<button data-attr-disabled="0">Click</button>'
    );

    const el = document.createElement(tagName);
    document.body.appendChild(el);

    const btn = el.querySelector('button');
    expect(btn?.hasAttribute('disabled')).toBe(true);

    isChecked = false;
    el._updateDynamicParts();
    await new Promise(r => queueMicrotask(r));
    expect(btn?.hasAttribute('disabled')).toBe(false);

    document.body.removeChild(el);
  });

  it('should handle event listeners', async () => {
    const handler = vi.fn();
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicEvent(0, 'click', handler);
      },
      '<button data-event-click="0">Click</button>'
    );

    const el = document.createElement(tagName);
    document.body.appendChild(el);

    const btn = el.querySelector('button')!;
    btn.click();
    expect(handler).toHaveBeenCalledTimes(1);

    document.body.removeChild(el);
  });

  // Bug fix 1.4 regression test: stable event wrapper
  it('should not remove/re-add event listeners on each render', async () => {
    let clickCount = 0;
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicEvent(0, 'click', () => clickCount++);
      },
      '<button data-event-click="0">Click</button>'
    );

    const el = document.createElement(tagName);
    document.body.appendChild(el);
    const btn = el.querySelector('button')!;

    const addSpy = vi.spyOn(btn, 'addEventListener');
    const removeSpy = vi.spyOn(btn, 'removeEventListener');

    // Re-render multiple times
    el._updateDynamicParts();
    await new Promise(r => queueMicrotask(r));
    el._updateDynamicParts();
    await new Promise(r => queueMicrotask(r));

    // Listener should NOT be re-added (stable wrapper already registered)
    expect(addSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();

    // But clicking should still call the latest handler
    btn.click();
    expect(clickCount).toBe(1);

    document.body.removeChild(el);
  });

  // Bug fix 1.5 regression test: state batching
  it('should batch multiple state updates into a single render', async () => {
    let renderCount = 0;
    const tagName = defineTestComponent(
      (el) => {
        renderCount++;
        el._setDynamicValue(0, `${el._state.a || 0}-${el._state.b || 0}`);
      },
      '<div><span data-dyn="0"></span></div>'
    );

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const initialRenders = renderCount;

    // Two synchronous state updates should batch into one render
    el._updateState('a', 1);
    el._updateState('b', 2);

    // Before microtask, no additional render should have occurred
    expect(renderCount).toBe(initialRenders);

    // After microtask, exactly one additional render
    await new Promise(r => queueMicrotask(r));
    expect(renderCount).toBe(initialRenders + 1);

    document.body.removeChild(el);
  });

  // Bug fix 1.1 regression test: effect cleanup on disconnect
  it('should call all effect cleanups on disconnect', async () => {
    const cleanup1 = vi.fn();
    const cleanup2 = vi.fn();

    const tagName = defineTestComponent(
      () => {},
      '<div>test</div>'
    );

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Simulate effects that have been flushed (cleanups stored in hooks)
    el._instance.hooks = [
      { callback: () => cleanup1, deps: [], cleanup: cleanup1 },
      { callback: () => cleanup2, deps: [1], cleanup: cleanup2 },
    ];

    document.body.removeChild(el);

    expect(cleanup1).toHaveBeenCalled();
    expect(cleanup2).toHaveBeenCalled();
  });

  // Bug fix 1.2 regression test: no effects after disconnect
  it('should not run effects after disconnect', async () => {
    const effectCallback = vi.fn();
    const tagName = defineTestComponent(
      () => {},
      '<div>test</div>'
    );

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Queue an effect
    el._instance.effects = [{ callback: effectCallback, deps: [] }];

    // Disconnect before microtask fires
    document.body.removeChild(el);

    // Wait for microtask
    await new Promise(r => queueMicrotask(r));
    await new Promise(r => queueMicrotask(r));

    // Effect should NOT have been called since component is disconnected
    expect(effectCallback).not.toHaveBeenCalled();
  });

  it('should call attributeChangedCallback and update state', async () => {
    const tagName = `test-attr-${++tagCounter}`;

    class AttrTestElement extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');

      static get observedAttributes() { return ['count']; }

      _render() {
        const count = this._state.count !== undefined ? this._state.count : '0';
        this._setDynamicValue(0, count);
      }
    }

    customElements.define(tagName, AttrTestElement);

    const el = document.createElement(tagName);
    document.body.appendChild(el);

    el.setAttribute('count', '5');

    // Wait for batched update
    await new Promise(r => queueMicrotask(r));

    expect(el.textContent).toContain('5');
    document.body.removeChild(el);
  });

  it('should create custom elements from polyx- prefixed string values', async () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicValue(0, 'polyx-child');
      },
      '<div><span data-dyn="0"></span></div>'
    );

    const el = document.createElement(tagName);
    document.body.appendChild(el);

    const child = el.querySelector('polyx-child');
    expect(child).not.toBeNull();
    document.body.removeChild(el);
  });
});

describe('_setKeyedList', () => {
  let tagCounter2 = 100;

  // Define a simple child component for keyed list tests
  function defineChildComponent(name?: string): string {
    const tagName = name || `test-child-${++tagCounter2}`;
    try {
      class ChildEl extends PolyXElement {
        static template = createTemplate('<div><span data-dyn="0"></span></div>');
        _render() {
          this._setDynamicValue(0, (this as any)._props.name || '');
        }
      }
      customElements.define(tagName, ChildEl);
    } catch (e) {
      // Already defined
    }
    return tagName;
  }

  function defineKeyedParent(
    childTag: string,
    renderFn: (el: any) => void,
    name?: string
  ): string {
    const tagName = name || `test-keyed-${++tagCounter2}`;
    class ParentEl extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');
      _render() {
        renderFn(this);
      }
    }
    customElements.define(tagName, ParentEl);
    return tagName;
  }

  it('should create elements on first render', async () => {
    const childTag = defineChildComponent();
    const tagName = defineKeyedParent(childTag, (el) => {
      el._setKeyedList(0, [
        { key: 1, tag: childTag, props: { name: 'Alice' } },
        { key: 2, tag: childTag, props: { name: 'Bob' } },
      ]);
    });

    const el = document.createElement(tagName);
    document.body.appendChild(el);
    await new Promise(r => queueMicrotask(r));

    const children = el.querySelectorAll(childTag);
    expect(children.length).toBe(2);
    document.body.removeChild(el);
  });

  it('should reuse elements by key on re-render', async () => {
    const childTag = defineChildComponent();
    let items = [
      { key: 1, tag: childTag, props: { name: 'Alice' } },
      { key: 2, tag: childTag, props: { name: 'Bob' } },
    ];

    const tagName = defineKeyedParent(childTag, (el) => {
      el._setKeyedList(0, items);
    });

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    await new Promise(r => queueMicrotask(r));

    const firstChild = el.querySelectorAll(childTag)[0];

    // Reorder items (swap)
    items = [
      { key: 2, tag: childTag, props: { name: 'Bob' } },
      { key: 1, tag: childTag, props: { name: 'Alice' } },
    ];
    el._updateDynamicParts();
    await new Promise(r => queueMicrotask(r));

    const children = el.querySelectorAll(childTag);
    expect(children.length).toBe(2);
    // The element with key=1 should be reused (same DOM node)
    expect(children[1]).toBe(firstChild);
    document.body.removeChild(el);
  });

  it('should remove elements not in new list', async () => {
    const childTag = defineChildComponent();
    let items = [
      { key: 1, tag: childTag, props: { name: 'Alice' } },
      { key: 2, tag: childTag, props: { name: 'Bob' } },
      { key: 3, tag: childTag, props: { name: 'Carol' } },
    ];

    const tagName = defineKeyedParent(childTag, (el) => {
      el._setKeyedList(0, items);
    });

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    await new Promise(r => queueMicrotask(r));
    expect(el.querySelectorAll(childTag).length).toBe(3);

    // Remove middle item
    items = [
      { key: 1, tag: childTag, props: { name: 'Alice' } },
      { key: 3, tag: childTag, props: { name: 'Carol' } },
    ];
    el._updateDynamicParts();
    await new Promise(r => queueMicrotask(r));

    expect(el.querySelectorAll(childTag).length).toBe(2);
    document.body.removeChild(el);
  });

  it('should handle empty list', async () => {
    const childTag = defineChildComponent();
    let items: any[] = [
      { key: 1, tag: childTag, props: { name: 'Alice' } },
    ];

    const tagName = defineKeyedParent(childTag, (el) => {
      el._setKeyedList(0, items);
    });

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    await new Promise(r => queueMicrotask(r));
    expect(el.querySelectorAll(childTag).length).toBe(1);

    // Empty list
    items = [];
    el._updateDynamicParts();
    await new Promise(r => queueMicrotask(r));
    expect(el.querySelectorAll(childTag).length).toBe(0);

    document.body.removeChild(el);
  });
});

describe('startTransition', () => {
  let tagCounter3 = 200;

  it('should defer update when called inside startTransition', async () => {
    const tagName = `test-transition-${++tagCounter3}`;
    let renderCount = 0;

    class TransEl extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');
      _render() {
        renderCount++;
        this._setDynamicValue(0, `count: ${this._state.count || 0}`);
      }
    }
    customElements.define(tagName, TransEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    const initialRenders = renderCount;

    // Normal (sync) update
    el._updateState('count', 1);
    await new Promise(r => queueMicrotask(r));
    expect(renderCount).toBe(initialRenders + 1);

    // Transition update — should NOT fire on microtask
    const preTransitionRenders = renderCount;
    startTransition(() => {
      el._updateState('count', 2);
    });
    await new Promise(r => queueMicrotask(r));
    // Should NOT have rendered yet (transition goes to RAF, not microtask)
    expect(renderCount).toBe(preTransitionRenders);

    document.body.removeChild(el);
  });
});
