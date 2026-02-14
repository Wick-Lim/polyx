import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PolyXElement, createTemplate, clearTemplateCache, defineComponent } from '../component.js';
import { startTransition } from '../scheduler.js';
import * as scheduler from '../scheduler.js';

beforeEach(() => {
  clearTemplateCache();
});

let tagCounter = 3000;

function defineTestComponent(
  renderFn: (el: any) => void,
  templateHTML: string,
  name?: string
): string {
  const tagName = name || `comp-extra-${++tagCounter}`;
  class TestElement extends PolyXElement {
    static template = createTemplate(templateHTML);
    _render() {
      renderFn(this);
    }
  }
  customElements.define(tagName, TestElement);
  return tagName;
}

describe('PolyXElement _setProp / _setProps', () => {
  it('should update prop and schedule update when connected', async () => {
    let renderCount = 0;
    const tagName = defineTestComponent(
      (el) => { renderCount++; el._setDynamicValue(0, el._props.label || ''); },
      '<div><span data-dyn="0"></span></div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    const initial = renderCount;

    el._setProp('label', 'hello');
    await new Promise(r => queueMicrotask(r));
    expect(renderCount).toBe(initial + 1);

    document.body.removeChild(el);
  });

  it('_setProp should NOT schedule update if value unchanged', async () => {
    let renderCount = 0;
    const tagName = defineTestComponent(
      (el) => { renderCount++; },
      '<div>test</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    const initial = renderCount;

    el._setProp('x', 1);
    await new Promise(r => queueMicrotask(r));
    const afterFirst = renderCount;

    el._setProp('x', 1); // same value
    await new Promise(r => queueMicrotask(r));
    expect(renderCount).toBe(afterFirst); // no re-render

    document.body.removeChild(el);
  });

  it('_setProp should NOT schedule if not connected', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    // Not connected, just set prop
    el._setProp('x', 1);
    expect(el._props.x).toBe(1);
  });

  it('_setProps should batch update multiple props', async () => {
    let renderCount = 0;
    const tagName = defineTestComponent(
      (el) => { renderCount++; },
      '<div>test</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    const initial = renderCount;

    el._setProps({ a: 1, b: 2, c: 3 });
    await new Promise(r => queueMicrotask(r));
    expect(renderCount).toBe(initial + 1);
    expect(el._props.a).toBe(1);
    expect(el._props.b).toBe(2);
    expect(el._props.c).toBe(3);

    document.body.removeChild(el);
  });

  it('_setProps should NOT schedule if nothing changed', async () => {
    let renderCount = 0;
    const tagName = defineTestComponent(
      (el) => { renderCount++; },
      '<div>test</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    el._setProps({ a: 1 });
    await new Promise(r => queueMicrotask(r));
    const after = renderCount;

    el._setProps({ a: 1 }); // same value
    await new Promise(r => queueMicrotask(r));
    expect(renderCount).toBe(after);

    document.body.removeChild(el);
  });
});

describe('PolyXElement targeted state updates', () => {
  it('should use targeted handler when _renderState_key exists', async () => {
    const tagName = `comp-targeted-${++tagCounter}`;
    const targetedHandler = vi.fn();

    class TargetedEl extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');
      _render() {
        this._setDynamicValue(0, this._state.count || 0);
      }
      _renderState_count() {
        targetedHandler();
      }
    }
    customElements.define(tagName, TargetedEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    el._updateState('count', 5);
    await new Promise(r => queueMicrotask(r));
    expect(targetedHandler).toHaveBeenCalled();

    document.body.removeChild(el);
  });

  it('should fall back to full update when no targeted handler', async () => {
    let renderCount = 0;
    const tagName = defineTestComponent(
      (el) => { renderCount++; el._setDynamicValue(0, el._state.count || 0); },
      '<div><span data-dyn="0"></span></div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    const initial = renderCount;

    el._updateState('count', 5);
    await new Promise(r => queueMicrotask(r));
    expect(renderCount).toBe(initial + 1);

    document.body.removeChild(el);
  });

  it('should not schedule targeted update if disconnected during microtask', async () => {
    const tagName = `comp-targeted-disc-${++tagCounter}`;
    const handler = vi.fn();
    class TargetedDisc extends PolyXElement {
      static template = createTemplate('<div>test</div>');
      _render() {}
      _renderState_x() { handler(); }
    }
    customElements.define(tagName, TargetedDisc);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    el._updateState('x', 1);
    document.body.removeChild(el); // disconnect before microtask
    await new Promise(r => queueMicrotask(r));
    expect(handler).not.toHaveBeenCalled();
  });

  it('full update supersedes targeted update', async () => {
    const tagName = `comp-supersede-${++tagCounter}`;
    const handler = vi.fn();
    let renderCount = 0;
    class SupersedeEl extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');
      _render() { renderCount++; this._setDynamicValue(0, ''); }
      _renderState_x() { handler(); }
    }
    customElements.define(tagName, SupersedeEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    const initial = renderCount;

    // First schedule targeted update, then a full update
    el._updateState('x', 1); // targeted
    el._updateState('y', 2); // no handler → full update, should supersede
    await new Promise(r => queueMicrotask(r));

    // targeted handler may or may not be called, but full render should happen
    expect(renderCount).toBeGreaterThan(initial);

    document.body.removeChild(el);
  });
});

describe('PolyXElement _execMemo / _readHook', () => {
  it('_execMemo returns cached value when deps unchanged', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Set up hooks manually
    el._instance.hooks[0] = { value: 42, deps: [1, 2] };
    const result = el._execMemo(0, () => 99, [1, 2]);
    expect(result).toBe(42);

    document.body.removeChild(el);
  });

  it('_execMemo recomputes when deps change', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    el._instance.hooks[0] = { value: 42, deps: [1] };
    const result = el._execMemo(0, () => 99, [2]);
    expect(result).toBe(99);

    document.body.removeChild(el);
  });

  it('_execMemo computes when no prior hook', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const result = el._execMemo(5, () => 123, [1]);
    expect(result).toBe(123);

    document.body.removeChild(el);
  });

  it('_readHook reads useMemo value', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    el._instance.hooks[0] = { value: 'memo-val', deps: [1] };
    expect(el._readHook(0)).toBe('memo-val');

    document.body.removeChild(el);
  });

  it('_readHook reads context provider value', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    el._instance.hooks[0] = { provider: { value: 'ctx-val' }, unsubscribe: () => {} };
    expect(el._readHook(0)).toBe('ctx-val');

    document.body.removeChild(el);
  });

  it('_readHook returns undefined for null provider', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    el._instance.hooks[0] = { provider: null, unsubscribe: null };
    expect(el._readHook(0)).toBeUndefined();

    document.body.removeChild(el);
  });

  it('_readHook returns primitive hook directly', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    el._instance.hooks[0] = 'primitive';
    expect(el._readHook(0)).toBe('primitive');

    document.body.removeChild(el);
  });

  it('_readHook returns useRef object', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const refObj = { current: 'ref-val' };
    el._instance.hooks[0] = refObj;
    expect(el._readHook(0)).toBe(refObj);

    document.body.removeChild(el);
  });
});

describe('PolyXElement _queueEffect / _queueLayoutEffect / _flushTargetedEffects', () => {
  it('_queueEffect adds regular effect', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const cb = vi.fn();
    el._queueEffect(0, cb, [1]);
    expect(el._instance.hooks[0].callback).toBe(cb);

    document.body.removeChild(el);
  });

  it('_queueEffect skips if deps unchanged', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    el._queueEffect(0, cb1, [1]);
    el._queueEffect(0, cb2, [1]); // same deps, should skip
    expect(el._instance.hooks[0].callback).toBe(cb1);

    document.body.removeChild(el);
  });

  it('_queueLayoutEffect adds layout effect', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const cb = vi.fn();
    el._queueLayoutEffect(0, cb, [1]);
    expect(el._instance.hooks[0].callback).toBe(cb);

    document.body.removeChild(el);
  });

  it('_queueLayoutEffect skips if deps unchanged', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const cb1 = vi.fn();
    el._queueLayoutEffect(0, cb1, [1]);
    const cb2 = vi.fn();
    el._queueLayoutEffect(0, cb2, [1]);
    expect(el._instance.hooks[0].callback).toBe(cb1);

    document.body.removeChild(el);
  });

  it('_flushTargetedEffects runs layout effects synchronously and queues regular effects', async () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const layoutCleanup = vi.fn();
    const layoutCb = vi.fn(() => layoutCleanup);
    const regularCleanup = vi.fn();
    const regularCb = vi.fn(() => regularCleanup);

    el._queueLayoutEffect(0, layoutCb, undefined);
    el._queueEffect(1, regularCb, undefined);

    el._flushTargetedEffects();

    // Layout effect runs immediately
    expect(layoutCb).toHaveBeenCalled();
    // Regular effect not yet
    expect(regularCb).not.toHaveBeenCalled();

    await new Promise(r => queueMicrotask(r));
    expect(regularCb).toHaveBeenCalled();

    document.body.removeChild(el);
  });

  it('_flushTargetedEffects calls cleanup before re-running', async () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const cleanup = vi.fn();
    el._instance.hooks[0] = { callback: () => {}, deps: undefined, cleanup };
    el._queueLayoutEffect(0, () => {}, undefined);
    el._flushTargetedEffects();

    expect(cleanup).toHaveBeenCalled();

    document.body.removeChild(el);
  });

  it('_flushTargetedEffects is no-op when no effects pending', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Should not throw
    el._flushTargetedEffects();

    document.body.removeChild(el);
  });

  it('_flushTargetedEffects does not run regular effects if disconnected', async () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const cb = vi.fn();
    el._queueEffect(0, cb, undefined);
    el._flushTargetedEffects();

    document.body.removeChild(el); // disconnect before microtask
    await new Promise(r => queueMicrotask(r));
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('PolyXElement spread + unified elements', () => {
  it('_setDynamicSpread applies attributes to unified element', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicSpread(0, { class: 'foo', id: 'bar', disabled: true, hidden: false });
      },
      '<div data-px-el="0"></div>'
    );
    const el = document.createElement(tagName);
    document.body.appendChild(el);

    const target = el.querySelector('[data-px-el="0"]') || el.querySelector('div');
    if (target) {
      expect(target.getAttribute('class')).toBe('foo');
      expect(target.getAttribute('id')).toBe('bar');
      expect(target.hasAttribute('disabled')).toBe(true);
      expect(target.hasAttribute('hidden')).toBe(false);
    }

    document.body.removeChild(el);
  });

  it('_setDynamicSpread handles className', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicSpread(0, { className: 'my-class' });
      },
      '<div data-px-el="0"></div>'
    );
    const el = document.createElement(tagName);
    document.body.appendChild(el);

    const target = el.querySelector('div');
    expect(target?.getAttribute('class')).toBe('my-class');

    document.body.removeChild(el);
  });

  it('_setDynamicSpread handles event handlers', () => {
    const handler = vi.fn();
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicSpread(0, { onClick: handler });
      },
      '<button data-px-el="0">test</button>'
    );
    const el = document.createElement(tagName);
    document.body.appendChild(el);

    const btn = el.querySelector('button')!;
    btn.click();
    expect(handler).toHaveBeenCalled();

    document.body.removeChild(el);
  });

  it('_setDynamicSpread skips key, ref, children', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicSpread(0, { key: 'k', ref: {}, children: [], title: 'yes' });
      },
      '<div data-px-el="0"></div>'
    );
    const el = document.createElement(tagName);
    document.body.appendChild(el);

    const target = el.querySelector('div');
    expect(target?.hasAttribute('key')).toBe(false);
    expect(target?.hasAttribute('ref')).toBe(false);
    expect(target?.hasAttribute('children')).toBe(false);
    expect(target?.getAttribute('title')).toBe('yes');

    document.body.removeChild(el);
  });
});

describe('PolyXElement dynamic prop on child', () => {
  it('_setDynamicProp sets prop on polyx child element', () => {
    const childTag = `comp-child-prop-${++tagCounter}`;
    class ChildEl extends PolyXElement {
      static template = createTemplate('<div>child</div>');
      _render() {}
    }
    customElements.define(childTag, ChildEl);

    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicProp(0, 'label', 'hello');
      },
      `<${childTag} data-px-el="0"></${childTag}>`
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const child = el.querySelector(childTag) as any;
    expect(child._props.label).toBe('hello');

    document.body.removeChild(el);
  });

  it('_setDynamicProp stores pending props for non-upgraded element', () => {
    const tagName = defineTestComponent(
      (el) => {
        // Set prop on an element that doesn't have _setProp yet
        const div = document.createElement('div');
        el._childElements.set(5, div);
        el._setDynamicProp(5, 'test', 'value');
      },
      '<div>test</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    document.body.removeChild(el);
  });
});

describe('PolyXElement _setDynamicValue edge cases', () => {
  it('handles DocumentFragment values', () => {
    const tagName = defineTestComponent(
      (el) => {
        const frag = document.createDocumentFragment();
        const span = document.createElement('span');
        span.textContent = 'fragment child';
        frag.appendChild(span);
        el._setDynamicValue(0, frag);
      },
      '<div><span data-dyn="0"></span></div>'
    );
    const el = document.createElement(tagName);
    document.body.appendChild(el);

    expect(el.textContent).toContain('fragment child');
    document.body.removeChild(el);
  });

  it('handles null/undefined/false values', () => {
    let val: any = null;
    const tagName = defineTestComponent(
      (el) => { el._setDynamicValue(0, val); },
      '<div><span data-dyn="0"></span></div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Should not show text
    expect(el.textContent?.trim()).toBe('');

    val = undefined;
    el._updateDynamicParts();

    val = false;
    el._updateDynamicParts();

    document.body.removeChild(el);
  });

  it('handles Node value', () => {
    const tagName = defineTestComponent(
      (el) => {
        const node = document.createElement('b');
        node.textContent = 'bold';
        el._setDynamicValue(0, node);
      },
      '<div><span data-dyn="0"></span></div>'
    );
    const el = document.createElement(tagName);
    document.body.appendChild(el);

    expect(el.querySelector('b')).not.toBeNull();
    document.body.removeChild(el);
  });
});

describe('PolyXElement children and reconnection', () => {
  it('saves light DOM children as props.children on mount', () => {
    const tagName = defineTestComponent(
      (el) => {},
      '<div>template</div>'
    );
    const el = document.createElement(tagName) as any;

    // Add light DOM children before mount
    const child = document.createElement('span');
    child.textContent = 'light dom';
    el.appendChild(child);

    document.body.appendChild(el);
    expect(el._props.children).not.toBeUndefined();

    document.body.removeChild(el);
  });

  it('re-renders on reconnection if already mounted', async () => {
    let renderCount = 0;
    const tagName = defineTestComponent(
      (el) => { renderCount++; },
      '<div>test</div>'
    );
    const el = document.createElement(tagName);
    document.body.appendChild(el);
    const afterMount = renderCount;

    document.body.removeChild(el);
    document.body.appendChild(el); // reconnect

    expect(renderCount).toBeGreaterThan(afterMount);

    document.body.removeChild(el);
  });

  it('restores pending props on connect', () => {
    const tagName = defineTestComponent(
      (el) => {},
      '<div>test</div>'
    );
    const el = document.createElement(tagName) as any;
    (el as any).__pendingPolyXProps = { foo: 'bar' };
    document.body.appendChild(el);

    expect(el._props.foo).toBe('bar');
    expect((el as any).__pendingPolyXProps).toBeUndefined();

    document.body.removeChild(el);
  });
});

describe('PolyXElement _createChild', () => {
  it('creates child element with props', () => {
    const childTag = `comp-create-child-${++tagCounter}`;
    class CreateChildEl extends PolyXElement {
      static template = createTemplate('<div>child</div>');
      _render() {}
    }
    customElements.define(childTag, CreateChildEl);

    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const child = el._createChild(childTag, { name: 'test' });
    expect(child.tagName.toLowerCase()).toBe(childTag);

    document.body.removeChild(el);
  });

  it('creates child element without props', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const child = el._createChild('div');
    expect(child.tagName).toBe('DIV');

    document.body.removeChild(el);
  });
});

describe('defineComponent', () => {
  it('creates and registers a custom element', () => {
    const tagName = `comp-define-${++tagCounter}`;
    const renderFn = vi.fn();
    defineComponent(tagName, renderFn);

    // defineComponent registers the element
    const Ctor = customElements.get(tagName);
    expect(Ctor).toBeDefined();

    const el = document.createElement(tagName);
    document.body.appendChild(el);
    // Element is created as an instance of the registered class
    expect(el).toBeInstanceOf(Ctor!);

    document.body.removeChild(el);
  });
});

describe('PolyXElement unified element markers', () => {
  it('_setDynamicAttribute on unified element', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicAttribute(0, 'title', 'hello');
      },
      '<div data-px-el="0">test</div>'
    );
    const el = document.createElement(tagName);
    document.body.appendChild(el);

    const target = el.querySelector('[data-px-el="0"]');
    expect(target?.getAttribute('title')).toBe('hello');

    document.body.removeChild(el);
  });

  it('_setDynamicAttribute removes null/false/undefined', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicAttribute(0, 'title', null);
      },
      '<div data-px-el="0" title="old">test</div>'
    );
    const el = document.createElement(tagName);
    document.body.appendChild(el);

    const target = el.querySelector('[data-px-el="0"]');
    expect(target?.hasAttribute('title')).toBe(false);

    document.body.removeChild(el);
  });

  it('_setDynamicAttribute sets boolean true as empty string', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicAttribute(0, 'disabled', true);
      },
      '<button data-px-el="0">test</button>'
    );
    const el = document.createElement(tagName);
    document.body.appendChild(el);

    const btn = el.querySelector('[data-px-el="0"]');
    expect(btn?.getAttribute('disabled')).toBe('');

    document.body.removeChild(el);
  });

  it('_setDynamicEvent on unified element', () => {
    const handler = vi.fn();
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicEvent(0, 'click', handler);
      },
      '<button data-px-el="0">test</button>'
    );
    const el = document.createElement(tagName);
    document.body.appendChild(el);

    const btn = el.querySelector('button')!;
    btn.click();
    expect(handler).toHaveBeenCalled();

    document.body.removeChild(el);
  });
});

describe('PolyXElement static createTemplate', () => {
  it('PolyXElement.createTemplate works like standalone', () => {
    const t = PolyXElement.createTemplate('<div>static</div>');
    expect(t).toBeInstanceOf(HTMLTemplateElement);
  });
});

describe('PolyXElement _updateDynamicParts when not connected', () => {
  it('should be a no-op', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    // Not connected — should not throw
    el._updateDynamicParts();
  });
});

describe('PolyXElement legacy data-spread markers', () => {
  it('should scan data-spread attributes and populate legacy dynamic elements map', () => {
    const tagName = defineTestComponent(
      (el) => {
        // Use legacy spread
        el._setDynamicSpread(0, { title: 'spread-test' });
      },
      '<div data-spread="0">spread content</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // The legacy scan should have found the data-spread element
    const spreadKey = 'spread-0';
    expect(el._dynamicElements.has(spreadKey)).toBe(true);
    const elements = el._dynamicElements.get(spreadKey);
    expect(elements!.length).toBeGreaterThanOrEqual(1);

    // The spread should have applied the title attribute
    const target = elements![0];
    expect(target.getAttribute('title')).toBe('spread-test');

    document.body.removeChild(el);
  });
});

describe('PolyXElement hydration (_hydrateExistingDOM)', () => {
  it('should find comment markers and dynamic elements in existing DOM', () => {
    const tagName = `comp-hydrate-${++tagCounter}`;
    class HydrateEl extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');
      _render() {
        // Do NOT set dynamic value so that markers remain intact for assertion
      }
    }
    customElements.define(tagName, HydrateEl);

    const el = document.createElement(tagName) as any;

    // Set up pre-existing DOM that simulates SSR output
    const comment = document.createComment('dyn-0');
    el.appendChild(comment);
    const dynEl = document.createElement('div');
    dynEl.setAttribute('data-px-el', '0');
    el.appendChild(dynEl);

    // Mark as hydrating
    (el as any).__polyx_hydrating = true;

    document.body.appendChild(el);

    // After hydration, the comment dyn marker should have been discovered
    expect(el._valueMarkers[0]).toBe(comment);
    // The dynamic element should have been discovered
    expect(el._elements[0]).toBe(dynEl);

    document.body.removeChild(el);
  });

  it('should find legacy data-child-idx markers during hydration', () => {
    const tagName = `comp-hydrate-legacy-${++tagCounter}`;
    class HydrateLegacyEl extends PolyXElement {
      static template = createTemplate('<div>test</div>');
      _render() {}
    }
    customElements.define(tagName, HydrateLegacyEl);

    const el = document.createElement(tagName) as any;

    // Pre-existing DOM with legacy markers
    const childEl = document.createElement('div');
    childEl.setAttribute('data-child-idx', '3');
    el.appendChild(childEl);

    const eventEl = document.createElement('button');
    eventEl.setAttribute('data-event-click', '1');
    el.appendChild(eventEl);

    (el as any).__polyx_hydrating = true;
    document.body.appendChild(el);

    // Legacy scan should populate elements
    expect(el._elements[3]).toBe(childEl);
    expect(el._childElements.get(3)).toBe(childEl);

    document.body.removeChild(el);
  });
});

describe('PolyXElement disconnect and reconnect cleanup', () => {
  it('should clean up hook cleanups on disconnect', async () => {
    const tagName = `comp-disconnect-hooks-${++tagCounter}`;
    const cleanup = vi.fn();
    class DisconnectEl extends PolyXElement {
      static template = createTemplate('<div>test</div>');
      _render() {}
    }
    customElements.define(tagName, DisconnectEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Simulate hooks with cleanups
    el._instance.hooks[0] = { callback: () => {}, deps: [], cleanup };
    el._instance.hooks[1] = { callback: () => {}, deps: [], cleanup: undefined };
    el._instance.hooks[2] = 'primitive-hook'; // no cleanup

    document.body.removeChild(el);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('should clean up unified element event listeners on disconnect', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicEvent(0, 'click', () => {});
      },
      '<button data-px-el="0">btn</button>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const btn = el.querySelector('button')!;
    expect((btn as any).__polyx_wrap_click).toBeTruthy();

    document.body.removeChild(el);

    // After disconnect, wrapper should be cleaned up
    expect((btn as any).__polyx_wrap_click).toBeNull();
    expect((btn as any).__polyx_evt_click).toBeNull();
  });

  it('should clean up legacy event listeners on disconnect', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicEvent(0, 'click', () => {});
      },
      '<button data-event-click="0">btn</button>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Get elements from legacy map
    const legacyKey = 'event-click-0';
    const legacyElements = el._dynamicElements.get(legacyKey);
    expect(legacyElements).toBeDefined();
    const btn = legacyElements![0];
    expect((btn as any).__polyx_wrap_click).toBeTruthy();

    document.body.removeChild(el);

    // After disconnect, legacy wrappers should be cleaned up
    expect((btn as any).__polyx_wrap_click).toBeNull();
    expect((btn as any).__polyx_evt_click).toBeNull();
  });
});

describe('defineComponent with HMR', () => {
  it('should call renderFn when the component renders', () => {
    const tagName = `comp-define-hmr-${++tagCounter}`;
    const renderFn = vi.fn();

    // defineComponent creates a class that calls renderFn(this) in _render
    defineComponent(tagName, renderFn);

    const el = document.createElement(tagName) as any;

    // We need a template for mount to work
    // defineComponent doesn't set a template, so _mount will bail
    // But we can call _updateDynamicParts directly after setting connected
    el._isConnected = true;
    el._hasMounted = true;
    el._updateDynamicParts();

    expect(renderFn).toHaveBeenCalledWith(el);
  });
});

// ============================================================
// Additional coverage tests for remaining uncovered lines
// ============================================================

describe('PolyXElement _attrToStateKey (line 83)', () => {
  it('converts hyphenated attribute names to camelCase via attributeChangedCallback', async () => {
    const tagName = `comp-cov-${++tagCounter}`;
    class AttrEl extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');
      static get observedAttributes() {
        return ['my-attr', 'some-long-name'];
      }
      _render() {
        this._setDynamicValue(0, this._state.myAttr || '');
      }
    }
    customElements.define(tagName, AttrEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    el.setAttribute('my-attr', 'hello');
    await new Promise(r => queueMicrotask(r));
    expect(el._state.myAttr).toBe('hello');
    expect(el._props.myAttr).toBe('hello');

    el.setAttribute('some-long-name', 'world');
    await new Promise(r => queueMicrotask(r));
    expect(el._state.someLongName).toBe('world');

    document.body.removeChild(el);
  });
});

describe('PolyXElement array rendering via _setDynamicValue (lines 336-351)', () => {
  it('renders an array of string values as text nodes', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicValue(0, ['alpha', 'beta', 'gamma']);
      },
      '<div><span data-dyn="0"></span></div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    expect(el.textContent).toContain('alpha');
    expect(el.textContent).toContain('beta');
    expect(el.textContent).toContain('gamma');

    document.body.removeChild(el);
  });

  it('reconciles array updates (add/remove items)', () => {
    let items = ['a', 'b'];
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicValue(0, items);
      },
      '<div><span data-dyn="0"></span></div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    expect(el.textContent).toContain('a');
    expect(el.textContent).toContain('b');

    // Update to a different array
    items = ['a', 'b', 'c'];
    el._updateDynamicParts();

    expect(el.textContent).toContain('c');

    // Shrink the array
    items = ['x'];
    el._updateDynamicParts();

    expect(el.textContent).toContain('x');
    expect(el.textContent).not.toContain('b');

    document.body.removeChild(el);
  });

  it('renders arrays with mixed value types (false, null, Node, polyx-tag, string)', () => {
    const tagName = defineTestComponent(
      (el) => {
        const span = document.createElement('span');
        span.textContent = 'node-val';
        el._setDynamicValue(0, [false, null, span, 'plain text']);
      },
      '<div><span data-dyn="0"></span></div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // false and null should produce comment nodes (not visible text)
    // The span node should be in the DOM
    expect(el.querySelector('span')).not.toBeNull();
    expect(el.textContent).toContain('node-val');
    expect(el.textContent).toContain('plain text');

    document.body.removeChild(el);
  });
});

describe('PolyXElement _createNodeFromValue (lines 405-412)', () => {
  it('creates comment node for false/null/undefined values in arrays', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicValue(0, [false, null, undefined]);
      },
      '<div><span data-dyn="0"></span></div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Count comment nodes inside the div (excluding the dyn marker)
    const div = el.querySelector('div');
    const walker = document.createTreeWalker(div!, NodeFilter.SHOW_COMMENT);
    let commentCount = 0;
    while (walker.nextNode()) commentCount++;
    // The dyn marker comment + 3 falsy comment nodes = at least 4
    expect(commentCount).toBeGreaterThanOrEqual(4);

    document.body.removeChild(el);
  });

  it('creates custom element for polyx-* tagged strings in arrays', () => {
    // Define a polyx component so the tag is valid
    const childTag = `polyx-arraychild${++tagCounter}`;
    class ArrayChild extends PolyXElement {
      static template = createTemplate('<div>array-child</div>');
      _render() {}
    }
    customElements.define(childTag, ArrayChild);

    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicValue(0, [childTag]);
      },
      '<div><span data-dyn="0"></span></div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    expect(el.querySelector(childTag)).not.toBeNull();

    document.body.removeChild(el);
  });
});

describe('PolyXElement effect cleanups in _runEffects (lines 669-674)', () => {
  it('calls existing cleanup and stores new cleanup from effect callback', async () => {
    const oldCleanup = vi.fn();
    const newCleanup = vi.fn();
    const tagName = `comp-cov-eff-${++tagCounter}`;
    class EffectCleanupEl extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');
      _render() {
        this._setDynamicValue(0, this._state.count || 0);
        // Push an effect with an existing cleanup (simulating a re-run scenario)
        this._instance.effects.push({
          callback: () => newCleanup,
          cleanup: oldCleanup,
        });
      }
    }
    customElements.define(tagName, EffectCleanupEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // After mount, effects are queued via microtask
    await new Promise(r => queueMicrotask(r));

    // The old cleanup should have been called before the callback ran
    expect(oldCleanup).toHaveBeenCalledTimes(1);
    // The newCleanup function is just returned, not called yet

    document.body.removeChild(el);
  });
});

describe('PolyXElement layout effect cleanups in _runLayoutEffects (lines 681-683)', () => {
  it('calls existing cleanup and stores new cleanup from layout effect callback', () => {
    const oldCleanup = vi.fn();
    const newCleanup = vi.fn();
    const tagName = `comp-cov-layout-${++tagCounter}`;
    class LayoutCleanupEl extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');
      _render() {
        this._setDynamicValue(0, this._state.count || 0);
        // Push a layout effect with existing cleanup (simulating re-run)
        this._instance.layoutEffects.push({
          callback: () => newCleanup,
          cleanup: oldCleanup,
        });
      }
    }
    customElements.define(tagName, LayoutCleanupEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Layout effects run synchronously during mount's _updateDynamicParts
    // The old cleanup should have been called
    expect(oldCleanup).toHaveBeenCalledTimes(1);

    document.body.removeChild(el);
  });
});

describe('PolyXElement _flushTargetedEffects regular effect cleanup (line 226)', () => {
  it('calls cleanup of regular effect during targeted flush', async () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const cleanup = vi.fn();
    // Set up a hook with an existing cleanup function
    el._instance.hooks[0] = {
      callback: () => {},
      deps: undefined,
      cleanup,
    };

    // Queue a new regular effect at the same hook index (deps changed = undefined)
    el._queueEffect(0, () => {}, undefined);
    el._flushTargetedEffects();

    // Wait for the regular effect microtask
    await new Promise(r => queueMicrotask(r));

    // The old cleanup should have been called before running the new effect
    expect(cleanup).toHaveBeenCalled();

    document.body.removeChild(el);
  });
});

describe('PolyXElement _scheduleTargetedUpdate with _pendingUpdate (lines 238, 250)', () => {
  it('skips targeted update when _pendingUpdate is true (line 238)', async () => {
    const tagName = `comp-cov-pend-${++tagCounter}`;
    const handler = vi.fn();
    class PendUpdateEl extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');
      _render() {
        this._setDynamicValue(0, this._state.x || 0);
      }
      _renderState_x() {
        handler();
      }
    }
    customElements.define(tagName, PendUpdateEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Force a pending full update
    el._pendingUpdate = true;

    // Now trigger targeted update — it should be skipped
    el._updateState('x', 42);
    await new Promise(r => queueMicrotask(r));

    // Targeted handler should NOT have been called (skipped because _pendingUpdate = true)
    expect(handler).not.toHaveBeenCalled();

    el._pendingUpdate = false;
    document.body.removeChild(el);
  });

  it('breaks out of targeted loop when full update is scheduled mid-loop (line 250)', async () => {
    const tagName = `comp-cov-break-${++tagCounter}`;
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    class BreakLoopEl extends PolyXElement {
      static template = createTemplate('<div>test</div>');
      _render() {}
      _renderState_a() {
        handlerA();
        // During this handler, trigger a full update
        this._scheduleUpdate();
      }
      _renderState_b() {
        handlerB();
      }
    }
    customElements.define(tagName, BreakLoopEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Schedule two targeted updates
    el._updateState('a', 1);
    el._updateState('b', 2);
    await new Promise(r => queueMicrotask(r));

    // Handler a runs and triggers a full update, which sets _pendingUpdate = true
    // Handler b should be skipped due to the break
    expect(handlerA).toHaveBeenCalled();
    expect(handlerB).not.toHaveBeenCalled();

    // Clean up the pending full update
    await new Promise(r => queueMicrotask(r));
    document.body.removeChild(el);
  });
});

describe('PolyXElement scheduler integration (lines 268-279)', () => {
  it('uses idle scheduling when isIdle returns true during _scheduleUpdate', async () => {
    let renderCount = 0;
    const tagName = `comp-cov-idle-${++tagCounter}`;
    class IdleEl extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');
      _render() {
        renderCount++;
        this._setDynamicValue(0, this._state.val || 0);
      }
    }
    customElements.define(tagName, IdleEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    const afterMount = renderCount;

    // Mock isIdle to return true so _scheduleUpdate takes the idle path
    const isIdleSpy = vi.spyOn(scheduler, 'isIdle').mockReturnValue(true);
    const scheduleIdleSpy = vi.spyOn(scheduler, 'scheduleIdle');

    el._state.val = 99;
    el._scheduleUpdate();

    // scheduleIdle should have been called
    expect(scheduleIdleSpy).toHaveBeenCalled();

    // Execute the scheduled callback directly
    const scheduledFn = scheduleIdleSpy.mock.calls[0][0];
    scheduledFn();

    expect(renderCount).toBeGreaterThan(afterMount);

    isIdleSpy.mockRestore();
    scheduleIdleSpy.mockRestore();
    document.body.removeChild(el);
  });

  it('uses transition scheduling when isTransition returns true during _scheduleUpdate', async () => {
    let renderCount = 0;
    const tagName = `comp-cov-trans-${++tagCounter}`;
    class TransEl extends PolyXElement {
      static template = createTemplate('<div><span data-dyn="0"></span></div>');
      _render() {
        renderCount++;
        this._setDynamicValue(0, this._state.val || 0);
      }
    }
    customElements.define(tagName, TransEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    const afterMount = renderCount;

    // Mock isTransition to return true
    const isTransSpy = vi.spyOn(scheduler, 'isTransition').mockReturnValue(true);
    const schedTransSpy = vi.spyOn(scheduler, 'scheduleTransition');

    el._state.val = 50;
    el._scheduleUpdate();

    // scheduleTransition should have been called
    expect(schedTransSpy).toHaveBeenCalled();

    // Execute the scheduled callback directly
    const scheduledFn = schedTransSpy.mock.calls[0][0];
    scheduledFn();

    expect(renderCount).toBeGreaterThan(afterMount);

    isTransSpy.mockRestore();
    schedTransSpy.mockRestore();
    document.body.removeChild(el);
  });
});

describe('PolyXElement __pendingPolyXProps in _createChild (line 424)', () => {
  it('stores pending props when created element is not yet upgraded', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Create a child with a tag that is NOT a registered custom element
    // so it won't have _setProps
    const child = el._createChild('div', { foo: 'bar', baz: 123 });
    // Since div doesn't have _setProps, props should be stored as __pendingPolyXProps
    expect((child as any).__pendingPolyXProps).toEqual({ foo: 'bar', baz: 123 });

    document.body.removeChild(el);
  });
});

describe('PolyXElement _setKeyedList early return (line 436)', () => {
  it('returns early when marker at index is undefined', () => {
    const tagName = defineTestComponent(() => {}, '<div>test</div>');
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // No value marker at index 99 — should return early without error
    el._setKeyedList(99, [{ key: 'a', tag: 'div', props: {} }]);

    document.body.removeChild(el);
  });
});

describe('PolyXElement legacy fallbacks (lines 483, 515, 541)', () => {
  it('_setDynamicAttribute falls back to legacy _dynamicElements map', () => {
    const tagName = defineTestComponent(
      (el) => {
        // Set up legacy map directly
        const div = document.createElement('div');
        el.appendChild(div);
        el._dynamicElements.set('attr-title-0', [div]);
        el._setDynamicAttribute(0, 'title', 'legacy-val');
      },
      '<div>test</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // The legacy element should have the attribute set
    const legacyElements = el._dynamicElements.get('attr-title-0');
    expect(legacyElements).toBeDefined();
    expect(legacyElements[0].getAttribute('title')).toBe('legacy-val');

    document.body.removeChild(el);
  });

  it('_setDynamicAttribute returns early when legacy map has no entry', () => {
    const tagName = defineTestComponent(
      (el) => {
        // No unified elements, no legacy map entry — should not throw
        el._setDynamicAttribute(999, 'title', 'nothing');
      },
      '<div>test</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    // No error
    document.body.removeChild(el);
  });

  it('_setDynamicEvent falls back to legacy _dynamicElements map', () => {
    const handler = vi.fn();
    const tagName = defineTestComponent(
      (el) => {
        const btn = document.createElement('button');
        btn.textContent = 'legacy';
        el.appendChild(btn);
        el._dynamicElements.set('event-click-0', [btn]);
        el._setDynamicEvent(0, 'click', handler);
      },
      '<div>test</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const legacyElements = el._dynamicElements.get('event-click-0');
    expect(legacyElements).toBeDefined();
    legacyElements[0].click();
    expect(handler).toHaveBeenCalled();

    document.body.removeChild(el);
  });

  it('_setDynamicEvent returns early when legacy map has no entry', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicEvent(999, 'click', () => {});
      },
      '<div>test</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    // No error
    document.body.removeChild(el);
  });

  it('_setDynamicSpread falls back to legacy _dynamicElements map', () => {
    const tagName = defineTestComponent(
      (el) => {
        const div = document.createElement('div');
        el.appendChild(div);
        el._dynamicElements.set('spread-0', [div]);
        el._setDynamicSpread(0, { 'data-legacy': 'spread-works' });
      },
      '<div>test</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const legacyElements = el._dynamicElements.get('spread-0');
    expect(legacyElements).toBeDefined();
    expect(legacyElements[0].getAttribute('data-legacy')).toBe('spread-works');

    document.body.removeChild(el);
  });

  it('_setDynamicSpread returns early when legacy map has no entry', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicSpread(999, { title: 'nothing' });
      },
      '<div>test</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);
    // No error
    document.body.removeChild(el);
  });
});

describe('PolyXElement _cleanup with effects and layout effects (lines 688-701)', () => {
  it('calls cleanup on pending effects and layout effects during disconnect', () => {
    const effectCleanup = vi.fn();
    const layoutCleanup = vi.fn();
    const tagName = `comp-cov-cleanup-${++tagCounter}`;
    class CleanupEffectsEl extends PolyXElement {
      static template = createTemplate('<div>test</div>');
      _render() {}
    }
    customElements.define(tagName, CleanupEffectsEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Manually add pending effects and layout effects with cleanups
    el._instance.effects.push({ callback: () => {}, cleanup: effectCleanup });
    el._instance.layoutEffects.push({ callback: () => {}, cleanup: layoutCleanup });

    document.body.removeChild(el);

    expect(effectCleanup).toHaveBeenCalledTimes(1);
    expect(layoutCleanup).toHaveBeenCalledTimes(1);
  });

  it('cleans up event wrappers on unified elements during disconnect (line 701)', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicEvent(0, 'click', () => {});
        el._setDynamicEvent(0, 'mouseover', () => {});
      },
      '<div data-px-el="0">test</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const target = el._elements[0];
    expect((target as any).__polyx_wrap_click).toBeTruthy();
    expect((target as any).__polyx_wrap_mouseover).toBeTruthy();

    document.body.removeChild(el);

    // After cleanup, all wrappers should be null
    expect((target as any).__polyx_wrap_click).toBeNull();
    expect((target as any).__polyx_evt_click).toBeNull();
    expect((target as any).__polyx_wrap_mouseover).toBeNull();
    expect((target as any).__polyx_evt_mouseover).toBeNull();
  });
});

describe('PolyXElement Suspense integration (lines 308-315)', () => {
  it('catches suspense promise and finds boundary', () => {
    const tagName = `comp-cov-suspense-${++tagCounter}`;
    let resolvePromise: () => void;
    const promise = new Promise<void>((resolve) => { resolvePromise = resolve; });

    class SuspenseChildEl extends PolyXElement {
      static template = createTemplate('<div>child</div>');
      _render() {
        throw promise;
      }
    }
    customElements.define(tagName, SuspenseChildEl);

    // Create a suspense boundary
    const suspense = document.createElement('polyx-suspense') as any;
    suspense.fallback = 'Loading...';
    document.body.appendChild(suspense);

    const el = document.createElement(tagName) as any;
    suspense.appendChild(el);

    // The suspense boundary should be suspended (synchronous)
    expect(suspense._isSuspended).toBe(true);

    // Clean up
    resolvePromise!();
    document.body.removeChild(suspense);
  });

  it('logs error when no suspense boundary found', () => {
    const tagName = `comp-cov-nosuspense-${++tagCounter}`;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    class NoSuspenseEl extends PolyXElement {
      static template = createTemplate('<div>child</div>');
      _render() {
        throw new Promise(() => {}); // Throw a promise but no boundary
      }
    }
    customElements.define(tagName, NoSuspenseEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    expect(consoleError).toHaveBeenCalledWith(
      'No <Suspense> boundary found for',
      expect.any(String)
    );

    consoleError.mockRestore();
    document.body.removeChild(el);
  });

  it('logs non-promise errors from _render', () => {
    const tagName = `comp-cov-err-${++tagCounter}`;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    class ErrorEl extends PolyXElement {
      static template = createTemplate('<div>child</div>');
      _render() {
        throw new Error('test error');
      }
    }
    customElements.define(tagName, ErrorEl);

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    expect(consoleError).toHaveBeenCalledWith('Update error:', expect.any(Error));

    consoleError.mockRestore();
    document.body.removeChild(el);
  });
});

describe('PolyXElement _setDynamicProp pending props (line 424 via _setDynamicProp)', () => {
  it('stores __pendingPolyXProps when element lacks _setProp', () => {
    const tagName = defineTestComponent(
      (el) => {
        // Create a plain div (no _setProp method) and register it in _elements
        const div = document.createElement('div');
        el._elements[0] = div;
        el._setDynamicProp(0, 'test', 'value');
        el._setDynamicProp(0, 'other', 42);
      },
      '<div>test</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const target = el._elements[0];
    expect((target as any).__pendingPolyXProps.test).toBe('value');
    expect((target as any).__pendingPolyXProps.other).toBe(42);

    document.body.removeChild(el);
  });
});

describe('PolyXElement _setKeyedList with valid marker', () => {
  it('performs keyed reconciliation with existing marker', () => {
    const childTag = `comp-cov-keyed-child-${++tagCounter}`;
    class KeyedChild extends PolyXElement {
      static template = createTemplate('<div>keyed</div>');
      _render() {}
    }
    customElements.define(childTag, KeyedChild);

    const tagName = defineTestComponent(
      (el) => {
        el._setKeyedList(0, [
          { key: 'a', tag: childTag, props: { label: 'A' } },
          { key: 'b', tag: childTag, props: { label: 'B' } },
        ]);
      },
      '<div><span data-dyn="0"></span></div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const children = el.querySelectorAll(childTag);
    expect(children.length).toBe(2);

    // Re-render with reorder
    el._setKeyedList(0, [
      { key: 'b', tag: childTag, props: { label: 'B2' } },
      { key: 'a', tag: childTag, props: { label: 'A2' } },
      { key: 'c', tag: childTag, props: { label: 'C' } },
    ]);

    const children2 = el.querySelectorAll(childTag);
    expect(children2.length).toBe(3);

    document.body.removeChild(el);
  });

  it('removes old keyed items not in the new list (line 459)', () => {
    const childTag = `comp-cov-keyed-rm-${++tagCounter}`;
    class KeyedRmChild extends PolyXElement {
      static template = createTemplate('<div>keyed</div>');
      _render() {}
    }
    customElements.define(childTag, KeyedRmChild);

    const tagName = defineTestComponent(
      (el) => {
        // Initial render with 3 items
        el._setKeyedList(0, [
          { key: 'x', tag: childTag, props: {} },
          { key: 'y', tag: childTag, props: {} },
          { key: 'z', tag: childTag, props: {} },
        ]);
      },
      '<div><span data-dyn="0"></span></div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    expect(el.querySelectorAll(childTag).length).toBe(3);

    // Re-render with only 1 item (remove x and z)
    el._setKeyedList(0, [
      { key: 'y', tag: childTag, props: {} },
    ]);

    expect(el.querySelectorAll(childTag).length).toBe(1);

    document.body.removeChild(el);
  });
});

describe('PolyXElement legacy _setDynamicAttribute with falsy value (line 486)', () => {
  it('removes attribute via legacy fallback when value is null', () => {
    const tagName = defineTestComponent(
      (el) => {
        const div = document.createElement('div');
        div.setAttribute('title', 'old-title');
        el.appendChild(div);
        el._dynamicElements.set('attr-title-0', [div]);
        // Set null to remove the attribute via legacy path
        el._setDynamicAttribute(0, 'title', null);
      },
      '<div>test</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    const legacyElements = el._dynamicElements.get('attr-title-0');
    expect(legacyElements).toBeDefined();
    expect(legacyElements[0].hasAttribute('title')).toBe(false);

    document.body.removeChild(el);
  });
});

describe('PolyXElement legacy data-attr-* markers in _scanDynamicElements (lines 633-636)', () => {
  it('scans data-attr-* markers during normal mount', () => {
    const tagName = defineTestComponent(
      (el) => {
        el._setDynamicAttribute(0, 'title', 'via-legacy');
      },
      '<div data-attr-title="0">content</div>'
    );
    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // The legacy scan should have found the data-attr-title element
    const legacyKey = 'attr-title-0';
    expect(el._dynamicElements.has(legacyKey)).toBe(true);
    const elements = el._dynamicElements.get(legacyKey);
    expect(elements!.length).toBeGreaterThanOrEqual(1);
    expect(elements![0].getAttribute('title')).toBe('via-legacy');

    document.body.removeChild(el);
  });
});
