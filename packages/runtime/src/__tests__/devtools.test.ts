import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDevTools, getDevTools } from '../devtools.js';
import { PolyXElement, createTemplate, clearTemplateCache } from '../component.js';

beforeEach(() => {
  clearTemplateCache();
  // Clean up any previous devtools
  if (typeof window !== 'undefined') {
    delete (window as any).__POLYX_DEVTOOLS__;
  }
});

afterEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as any).__POLYX_DEVTOOLS__;
  }
});

describe('initDevTools / getDevTools', () => {
  it('getDevTools should return null before initialization', () => {
    expect(getDevTools()).toBeNull();
  });

  it('initDevTools should create and return a DevTools instance', () => {
    const devTools = initDevTools();
    expect(devTools).not.toBeNull();
    expect(typeof devTools.getComponentTree).toBe('function');
    expect(typeof devTools.inspectComponent).toBe('function');
    expect(typeof devTools.startProfiling).toBe('function');
    expect(typeof devTools.stopProfiling).toBe('function');
    expect(typeof devTools.showPanel).toBe('function');
    expect(typeof devTools.hidePanel).toBe('function');
  });

  it('getDevTools should return the instance after initialization', () => {
    const devTools = initDevTools();
    expect(getDevTools()).toBe(devTools);
  });

  it('initDevTools should return same instance on multiple calls', () => {
    const dt1 = initDevTools();
    const dt2 = initDevTools();
    expect(dt1).toBe(dt2);
  });
});

describe('DevTools component tracking', () => {
  let tagCounter = 5000;

  function defineTestComponent(renderFn: (el: any) => void, templateHTML: string): string {
    const tagName = `dt-test-${++tagCounter}`;
    class TestElement extends PolyXElement {
      static template = createTemplate(templateHTML);
      _render() {
        renderFn(this);
      }
    }
    customElements.define(tagName, TestElement);
    return tagName;
  }

  it('should track component on mount', () => {
    const devTools = initDevTools();
    const tagName = defineTestComponent(() => {}, '<div>hello</div>');

    const el = document.createElement(tagName);
    document.body.appendChild(el);

    const tree = devTools.getComponentTree();
    const found = tree.find(c => c.tagName === tagName);
    expect(found).not.toBeUndefined();
    expect(found!.renderCount).toBeGreaterThanOrEqual(1);

    document.body.removeChild(el);
  });

  it('should track render count and timing', () => {
    const devTools = initDevTools();
    const tagName = defineTestComponent(
      (el) => { el._setDynamicValue(0, 'test'); },
      '<div><span data-dyn="0"></span></div>'
    );

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Initial render
    const info1 = devTools.inspectComponent(el);
    expect(info1).not.toBeNull();
    expect(info1!.renderCount).toBeGreaterThanOrEqual(1);
    expect(info1!.lastRenderTimeMs).toBeGreaterThanOrEqual(0);

    const prevRenderCount = info1!.renderCount;

    // Trigger re-render
    el._updateDynamicParts();

    const info2 = devTools.inspectComponent(el);
    expect(info2!.renderCount).toBe(prevRenderCount + 1);
    expect(info2!.averageRenderTimeMs).toBeGreaterThanOrEqual(0);

    document.body.removeChild(el);
  });

  it('should remove component on unmount', () => {
    const devTools = initDevTools();
    const tagName = defineTestComponent(() => {}, '<div>test</div>');

    const el = document.createElement(tagName);
    document.body.appendChild(el);

    expect(devTools.inspectComponent(el)).not.toBeNull();

    document.body.removeChild(el);

    expect(devTools.inspectComponent(el)).toBeNull();
  });

  it('inspectComponent should return null for untracked element', () => {
    const devTools = initDevTools();
    const el = document.createElement('div');
    expect(devTools.inspectComponent(el)).toBeNull();
  });

  it('should return state and props in debug info', () => {
    const devTools = initDevTools();
    const tagName = defineTestComponent(
      (el) => { el._setDynamicValue(0, el._state.count || 0); },
      '<div><span data-dyn="0"></span></div>'
    );

    const el = document.createElement(tagName) as any;
    el._state.count = 42;
    el._props.label = 'test';
    document.body.appendChild(el);

    const info = devTools.inspectComponent(el);
    expect(info!.state).toEqual({ count: 42 });
    expect(info!.props.label).toBe('test');

    document.body.removeChild(el);
  });
});

describe('DevTools profiling', () => {
  let tagCounter = 6000;

  function defineTestComponent(renderFn: (el: any) => void, templateHTML: string): string {
    const tagName = `dt-prof-${++tagCounter}`;
    class TestElement extends PolyXElement {
      static template = createTemplate(templateHTML);
      _render() {
        renderFn(this);
      }
    }
    customElements.define(tagName, TestElement);
    return tagName;
  }

  it('should collect updates during profiling', () => {
    const devTools = initDevTools();
    const tagName = defineTestComponent(
      (el) => { el._setDynamicValue(0, 'v'); },
      '<div><span data-dyn="0"></span></div>'
    );

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    devTools.startProfiling();

    // Trigger several re-renders
    el._updateDynamicParts();
    el._updateDynamicParts();
    el._updateDynamicParts();

    const result = devTools.stopProfiling();

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.componentUpdates.length).toBeGreaterThanOrEqual(3);
    expect(result.componentUpdates[0].tagName).toBe(tagName);
    expect(result.componentUpdates[0].renderTimeMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.componentUpdates[0].timestamp).toBe('number');

    document.body.removeChild(el);
  });

  it('should not collect updates when not profiling', () => {
    const devTools = initDevTools();
    const tagName = defineTestComponent(
      (el) => { el._setDynamicValue(0, 'v'); },
      '<div><span data-dyn="0"></span></div>'
    );

    const el = document.createElement(tagName) as any;
    document.body.appendChild(el);

    // Not profiling - trigger renders
    el._updateDynamicParts();
    el._updateDynamicParts();

    devTools.startProfiling();
    const result = devTools.stopProfiling();

    // Should only have updates from after startProfiling (0 updates)
    expect(result.componentUpdates.length).toBe(0);

    document.body.removeChild(el);
  });
});

describe('DevTools getSlowRenders', () => {
  let tagCounter = 7000;

  function defineTestComponent(renderFn: (el: any) => void, templateHTML: string): string {
    const tagName = `dt-slow-${++tagCounter}`;
    class TestElement extends PolyXElement {
      static template = createTemplate(templateHTML);
      _render() {
        renderFn(this);
      }
    }
    customElements.define(tagName, TestElement);
    return tagName;
  }

  it('should return empty array when all renders are fast', () => {
    const devTools = initDevTools();
    const tagName = defineTestComponent(() => {}, '<div>fast</div>');

    const el = document.createElement(tagName);
    document.body.appendChild(el);

    // With threshold of 16ms, a simple render should be fast
    const slow = devTools.getSlowRenders(16);
    expect(slow.length).toBe(0);

    document.body.removeChild(el);
  });

  it('should detect renders above custom threshold', () => {
    const devTools = initDevTools();
    const tagName = defineTestComponent(() => {}, '<div>test</div>');

    const el = document.createElement(tagName);
    document.body.appendChild(el);

    // With threshold of 0ms, everything is "slow"
    const slow = devTools.getSlowRenders(0);
    expect(slow.length).toBeGreaterThanOrEqual(1);

    document.body.removeChild(el);
  });
});

describe('DevTools panel', () => {
  it('should show and hide panel', () => {
    const devTools = initDevTools();

    devTools.showPanel();
    expect(document.querySelector('[data-polyx-devtools-panel]')).not.toBeNull();

    devTools.hidePanel();
    expect(document.querySelector('[data-polyx-devtools-panel]')).toBeNull();
  });

  it('should not create duplicate panels', () => {
    const devTools = initDevTools();

    devTools.showPanel();
    devTools.showPanel();

    const panels = document.querySelectorAll('[data-polyx-devtools-panel]');
    expect(panels.length).toBe(1);

    devTools.hidePanel();
  });

  it('hidePanel should be safe to call when no panel exists', () => {
    const devTools = initDevTools();
    // Should not throw
    devTools.hidePanel();
  });
});
