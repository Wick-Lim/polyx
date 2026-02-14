import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerComponent, renderToString, renderPage, getTemplateHTML, getStateDefaults, parseHTML, renderTemplate, resetInstanceCounters, computeInitialState, escapeJSON, getNextInstanceId, renderWithSuspense } from '../renderer.js';
import type { SuspenseRenderContext } from '../renderer.js';
import { VNode, VTextNode, VCommentNode } from '../vdom.js';

// Helper: create a mock component class with various template shapes
function createMockComponent(options: {
  template?: string | { innerHTML?: string; content?: { innerHTML?: string } } | null;
  observedAttributes?: string[];
} = {}) {
  const cls: any = {};
  if (options.template !== undefined) {
    cls.template = options.template;
  }
  if (options.observedAttributes !== undefined) {
    cls.observedAttributes = options.observedAttributes;
  }
  return cls;
}

describe('registerComponent + renderToString', () => {
  beforeEach(() => {
    resetInstanceCounters();
  });

  it('should register a component and render it to a string', () => {
    const comp = createMockComponent({
      template: '<div>Hello</div>',
      observedAttributes: [],
    });
    registerComponent('polyx-basic', comp);
    const html = renderToString('polyx-basic');
    expect(html).toContain('polyx-basic');
    expect(html).toContain('Hello');
  });

  it('should throw for an unregistered component', () => {
    expect(() => renderToString('polyx-nonexistent-xyz')).toThrow(
      'Component "polyx-nonexistent-xyz" not registered. Use registerComponent() first.'
    );
  });

  it('should return empty tags when the component has no template', () => {
    const comp = createMockComponent({ template: null });
    registerComponent('polyx-no-template', comp);
    const html = renderToString('polyx-no-template');
    expect(html).toBe('<polyx-no-template></polyx-no-template>');
  });

  it('should add data-polyx-hydrate attribute to the output', () => {
    const comp = createMockComponent({
      template: '<span>Hydrate me</span>',
      observedAttributes: [],
    });
    registerComponent('polyx-hydrate-check', comp);
    const html = renderToString('polyx-hydrate-check');
    expect(html).toContain('data-polyx-hydrate');
  });

  describe('props handling', () => {
    beforeEach(() => {
      const comp = createMockComponent({
        template: '<div>With props</div>',
        observedAttributes: [],
      });
      registerComponent('polyx-props', comp);
    });

    it('should render string props as attributes', () => {
      const html = renderToString('polyx-props', { title: 'My Title' });
      expect(html).toContain('title="My Title"');
    });

    it('should render number props as string attributes', () => {
      const html = renderToString('polyx-props', { count: 42 });
      expect(html).toContain('count="42"');
    });

    it('should render boolean true props as boolean attributes (no value)', () => {
      const html = renderToString('polyx-props', { active: true });
      expect(html).toContain('active');
      // Should not have active="true", just 'active' as a boolean attribute
      expect(html).not.toContain('active="true"');
    });

    it('should skip boolean false props', () => {
      const html = renderToString('polyx-props', { hidden: false });
      expect(html).not.toContain('hidden');
    });

    it('should skip non-primitive props (objects, arrays, functions)', () => {
      const html = renderToString('polyx-props', {
        data: { a: 1 },
        items: [1, 2, 3],
        onClick: () => {},
      });
      expect(html).not.toContain('data=');
      expect(html).not.toContain('items=');
      expect(html).not.toContain('onClick=');
    });

    it('should handle mixed prop types', () => {
      const html = renderToString('polyx-props', {
        name: 'test',
        count: 5,
        visible: true,
        disabled: false,
        handler: () => {},
      });
      expect(html).toContain('name="test"');
      expect(html).toContain('count="5"');
      expect(html).toContain('visible');
      expect(html).not.toContain('disabled');
      expect(html).not.toContain('handler');
    });
  });

  it('should merge state defaults with props and render template', () => {
    const comp = createMockComponent({
      template: '<div><span data-dyn="0"></span></div>',
      observedAttributes: ['count'],
    });
    registerComponent('polyx-state-props', comp);
    const html = renderToString('polyx-state-props', { count: 10 });
    // The dynamic marker should be replaced with a comment node
    expect(html).toContain('<!--dyn-0-->');
    expect(html).toContain('count="10"');
  });
});

describe('renderPage', () => {
  beforeEach(() => {
    const comp = createMockComponent({
      template: '<div>Page Content</div>',
      observedAttributes: [],
    });
    registerComponent('polyx-page-comp', comp);
  });

  it('should render a full page with all options', () => {
    const html = renderPage({
      title: 'My App',
      head: '<link rel="stylesheet" href="/style.css" />',
      bodyTag: 'polyx-page-comp',
      bodyProps: { theme: 'dark' },
      scripts: ['/app.js', '/vendor.js'],
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>My App</title>');
    expect(html).toContain('<link rel="stylesheet" href="/style.css" />');
    expect(html).toContain('polyx-page-comp');
    expect(html).toContain('theme="dark"');
    expect(html).toContain('<script type="module" src="/app.js"></script>');
    expect(html).toContain('<script type="module" src="/vendor.js"></script>');
    expect(html).toContain('Page Content');
  });

  it('should use default title when not provided', () => {
    const html = renderPage({});
    expect(html).toContain('<title>PolyX App</title>');
  });

  it('should render empty body when no bodyTag is provided', () => {
    const html = renderPage({});
    expect(html).toContain('<body>');
    expect(html).toContain('</body>');
    // bodyHTML should be empty string
    expect(html).not.toContain('polyx-');
  });

  it('should render no script tags when scripts is empty or not provided', () => {
    const html = renderPage({});
    expect(html).not.toContain('<script');
  });

  it('should render default head with empty string', () => {
    const html = renderPage({});
    expect(html).toContain('<meta charset="UTF-8" />');
    expect(html).toContain('<meta name="viewport"');
  });

  it('should render with bodyTag but no bodyProps', () => {
    const html = renderPage({ bodyTag: 'polyx-page-comp' });
    expect(html).toContain('polyx-page-comp');
    expect(html).toContain('data-polyx-hydrate');
  });

  it('should render multiple scripts in order', () => {
    const html = renderPage({
      scripts: ['/a.js', '/b.js', '/c.js'],
    });
    const aIdx = html.indexOf('/a.js');
    const bIdx = html.indexOf('/b.js');
    const cIdx = html.indexOf('/c.js');
    expect(aIdx).toBeLessThan(bIdx);
    expect(bIdx).toBeLessThan(cIdx);
  });
});

describe('getTemplateHTML', () => {
  it('should return the string when template is a string', () => {
    const comp = createMockComponent({ template: '<div>String template</div>' });
    expect(getTemplateHTML(comp)).toBe('<div>String template</div>');
  });

  it('should return innerHTML when template has innerHTML', () => {
    const comp = createMockComponent({
      template: { innerHTML: '<div>innerHTML template</div>' },
    });
    expect(getTemplateHTML(comp)).toBe('<div>innerHTML template</div>');
  });

  it('should return content.innerHTML when template has content.innerHTML', () => {
    const comp = createMockComponent({
      template: { content: { innerHTML: '<div>content.innerHTML template</div>' } },
    });
    expect(getTemplateHTML(comp)).toBe('<div>content.innerHTML template</div>');
  });

  it('should prefer innerHTML over content.innerHTML', () => {
    const comp = createMockComponent({
      template: {
        innerHTML: '<div>From innerHTML</div>',
        content: { innerHTML: '<div>From content</div>' },
      },
    });
    expect(getTemplateHTML(comp)).toBe('<div>From innerHTML</div>');
  });

  it('should return null when there is no template', () => {
    const comp = createMockComponent({});
    expect(getTemplateHTML(comp)).toBeNull();
  });

  it('should return null when template is falsy', () => {
    const comp = createMockComponent({ template: null });
    expect(getTemplateHTML(comp)).toBeNull();
  });

  it('should return null when template is an object with no innerHTML or content', () => {
    const comp: any = { template: {} };
    expect(getTemplateHTML(comp)).toBeNull();
  });

  it('should return null when template.content exists but has no innerHTML', () => {
    const comp: any = { template: { content: {} } };
    expect(getTemplateHTML(comp)).toBeNull();
  });
});

describe('getStateDefaults', () => {
  it('should return keys from observedAttributes with undefined values', () => {
    const comp = createMockComponent({
      observedAttributes: ['count', 'name', 'active'],
    });
    const defaults = getStateDefaults(comp);
    expect(defaults).toEqual({
      count: undefined,
      name: undefined,
      active: undefined,
    });
  });

  it('should return empty object when observedAttributes is empty', () => {
    const comp = createMockComponent({ observedAttributes: [] });
    expect(getStateDefaults(comp)).toEqual({});
  });

  it('should return empty object when observedAttributes is not defined', () => {
    const comp = createMockComponent({});
    expect(getStateDefaults(comp)).toEqual({});
  });

  it('should return empty object when observedAttributes is not an array', () => {
    const comp: any = { observedAttributes: 'not-an-array' };
    expect(getStateDefaults(comp)).toEqual({});
  });
});

describe('parseHTML', () => {
  it('should parse a simple element with text content', () => {
    const result = parseHTML('<div>Hello</div>');
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(VNode);
    expect((result[0] as VNode).tag).toBe('div');
    expect((result[0] as VNode).children).toHaveLength(1);
    expect(((result[0] as VNode).children[0] as VTextNode).text).toBe('Hello');
  });

  it('should parse a self-closing tag', () => {
    const result = parseHTML('<br />');
    expect(result).toHaveLength(1);
    expect((result[0] as VNode).tag).toBe('br');
    expect((result[0] as VNode).children).toHaveLength(0);
  });

  it('should parse self-closing tag without space', () => {
    const result = parseHTML('<input/>');
    expect(result).toHaveLength(1);
    expect((result[0] as VNode).tag).toBe('input');
  });

  it('should parse nested elements', () => {
    const result = parseHTML('<div><span>Inner</span></div>');
    expect(result).toHaveLength(1);
    const div = result[0] as VNode;
    expect(div.tag).toBe('div');
    expect(div.children).toHaveLength(1);
    const span = div.children[0] as VNode;
    expect(span.tag).toBe('span');
    expect(span.children).toHaveLength(1);
    expect((span.children[0] as VTextNode).text).toBe('Inner');
  });

  it('should parse deeply nested elements', () => {
    const result = parseHTML('<div><ul><li>Item</li></ul></div>');
    const div = result[0] as VNode;
    const ul = div.children[0] as VNode;
    expect(ul.tag).toBe('ul');
    const li = ul.children[0] as VNode;
    expect(li.tag).toBe('li');
    expect((li.children[0] as VTextNode).text).toBe('Item');
  });

  it('should parse attributes with values', () => {
    const result = parseHTML('<div class="container" id="main"></div>');
    const div = result[0] as VNode;
    expect(div.getAttribute('class')).toBe('container');
    expect(div.getAttribute('id')).toBe('main');
  });

  it('should parse boolean attributes (no value)', () => {
    const result = parseHTML('<input disabled readonly />');
    const input = result[0] as VNode;
    expect(input.getAttribute('disabled')).toBe('');
    expect(input.getAttribute('readonly')).toBe('');
  });

  it('should skip comment nodes', () => {
    const result = parseHTML('<!-- this is a comment --><div>After comment</div>');
    expect(result).toHaveLength(1);
    expect((result[0] as VNode).tag).toBe('div');
  });

  it('should handle comments within elements', () => {
    const result = parseHTML('<div><!-- comment -->text</div>');
    const div = result[0] as VNode;
    // Comment is skipped, only text remains
    expect(div.children.length).toBeGreaterThanOrEqual(1);
  });

  it('should parse text content between tags', () => {
    const result = parseHTML('<span>First</span> middle <span>Second</span>');
    // Should have: span, text, span
    expect(result.length).toBe(3);
    expect((result[0] as VNode).tag).toBe('span');
    expect((result[1] as VTextNode).text).toBe(' middle ');
    expect((result[2] as VNode).tag).toBe('span');
  });

  it('should return empty array for empty string', () => {
    const result = parseHTML('');
    expect(result).toEqual([]);
  });

  it('should handle closing tag without opening tag', () => {
    const result = parseHTML('</div>');
    // Closing tags are skipped by the parser
    expect(result).toEqual([]);
  });

  it('should handle multiple top-level elements', () => {
    const result = parseHTML('<div>A</div><span>B</span>');
    expect(result).toHaveLength(2);
    expect((result[0] as VNode).tag).toBe('div');
    expect((result[1] as VNode).tag).toBe('span');
  });

  it('should parse data-dyn attribute on span', () => {
    const result = parseHTML('<span data-dyn="0"></span>');
    const span = result[0] as VNode;
    expect(span.tag).toBe('span');
    expect(span.getAttribute('data-dyn')).toBe('0');
  });

  it('should handle tags with hyphens (custom elements)', () => {
    const result = parseHTML('<polyx-counter>Content</polyx-counter>');
    expect(result).toHaveLength(1);
    expect((result[0] as VNode).tag).toBe('polyx-counter');
  });

  it('should handle whitespace-only text between tags (trimmed to empty is skipped)', () => {
    const result = parseHTML('<div></div>   <span></span>');
    // whitespace-only text is skipped (text.trim() is falsy)
    expect(result).toHaveLength(2);
    expect((result[0] as VNode).tag).toBe('div');
    expect((result[1] as VNode).tag).toBe('span');
  });

  it('should handle text that is only at the end (no next tag)', () => {
    const result = parseHTML('<div></div>trailing text');
    expect(result).toHaveLength(2);
    expect((result[0] as VNode).tag).toBe('div');
    expect((result[1] as VTextNode).text).toBe('trailing text');
  });

  it('should handle unterminated comment gracefully', () => {
    const result = parseHTML('<!-- unterminated comment');
    expect(result).toEqual([]);
  });

  it('should handle unterminated closing tag gracefully', () => {
    const result = parseHTML('</div');
    // indexOf('>', pos) returns -1, so the parser breaks
    expect(result).toEqual([]);
  });

  it('should handle a < that is not a valid tag start', () => {
    // The regex /^<([a-zA-Z][a-zA-Z0-9-]*)/ won't match, so pos increments
    const result = parseHTML('< notag>content');
    // '< ' does not match tag pattern, parser increments pos, then encounters text 'notag>content'
    // This tests the fallthrough when tagMatch fails
    expect(result).toBeDefined();
  });

  it('should handle attribute parsing fallthrough for invalid attribute chars', () => {
    // '=' alone is not a valid attribute start per the regex
    const result = parseHTML('<div =invalid>text</div>');
    // The '=' won't match the attribute regex, pos increments past it
    const div = result[0] as VNode;
    expect(div.tag).toBe('div');
  });

  it('should parse sibling elements within a parent', () => {
    const result = parseHTML('<div><a>1</a><b>2</b><c>3</c></div>');
    const div = result[0] as VNode;
    expect(div.children).toHaveLength(3);
    expect((div.children[0] as VNode).tag).toBe('a');
    expect((div.children[1] as VNode).tag).toBe('b');
    expect((div.children[2] as VNode).tag).toBe('c');
  });
});

describe('parseHTML - findClosingTag with nested same-name elements', () => {
  it('should correctly find closing tag when same-name elements are nested', () => {
    const result = parseHTML('<div><div>Inner</div></div>');
    expect(result).toHaveLength(1);
    const outer = result[0] as VNode;
    expect(outer.tag).toBe('div');
    expect(outer.children).toHaveLength(1);
    const inner = outer.children[0] as VNode;
    expect(inner.tag).toBe('div');
    expect((inner.children[0] as VTextNode).text).toBe('Inner');
  });

  it('should handle multiple levels of same-name nesting', () => {
    const result = parseHTML('<div><div><div>Deep</div></div></div>');
    const outer = result[0] as VNode;
    const mid = outer.children[0] as VNode;
    const inner = mid.children[0] as VNode;
    expect(inner.tag).toBe('div');
    expect((inner.children[0] as VTextNode).text).toBe('Deep');
  });

  it('should handle nested same-name tags with siblings', () => {
    const result = parseHTML('<div><div>A</div><div>B</div></div>');
    const outer = result[0] as VNode;
    expect(outer.children).toHaveLength(2);
    expect(((outer.children[0] as VNode).children[0] as VTextNode).text).toBe('A');
    expect(((outer.children[1] as VNode).children[0] as VTextNode).text).toBe('B');
  });

  it('should not confuse tags with shared prefix (e.g., div vs divider)', () => {
    // findClosingTag checks the character after the tag name to ensure exact match
    const result = parseHTML('<div><divider>X</divider></div>');
    const outer = result[0] as VNode;
    expect(outer.tag).toBe('div');
    // The inner element should be 'divider'
    const inner = outer.children[0] as VNode;
    expect(inner.tag).toBe('divider');
  });

  it('should handle missing closing tag (findClosingTag returns -1)', () => {
    // Opening tag without a closing tag
    const result = parseHTML('<div><span>no close');
    // findClosingTag returns -1 for </div>, so the div has no children parsed
    // Then <span> is parsed (also no closing tag), then "no close" is text
    expect(result).toHaveLength(3);
    expect((result[0] as VNode).tag).toBe('div');
    expect((result[0] as VNode).children).toHaveLength(0);
    expect((result[1] as VNode).tag).toBe('span');
    expect((result[1] as VNode).children).toHaveLength(0);
    expect((result[2] as VTextNode).text).toBe('no close');
  });

  it('should handle nested same-name tag with only one closing tag (depth exhaustion)', () => {
    // <div><div></div> -- the outer div has a nested <div> inside, but only one </div>
    // findClosingTag for the outer div finds the nested <div>, increments depth to 2,
    // then finds </div>, decrements to 1, then pos exceeds html.length so the while
    // loop exits, hitting the final return -1 (line 267 in renderer.ts).
    // Since findClosingTag returns -1, the outer div gets no children and pos stays
    // where it was. The parser then re-encounters the inner <div></div> as a sibling.
    const result = parseHTML('<div><div></div>');
    expect(result).toHaveLength(2);
    // First: the outer div with no children (findClosingTag returned -1)
    expect((result[0] as VNode).tag).toBe('div');
    expect((result[0] as VNode).children).toHaveLength(0);
    // Second: the inner <div></div> re-parsed as a sibling
    expect((result[1] as VNode).tag).toBe('div');
  });
});

describe('renderTemplate', () => {
  it('should pass through normal VNodes unchanged (cloned)', () => {
    const div = new VNode('div');
    div.setAttribute('class', 'test');
    const result = renderTemplate([div], {});
    expect(result).toHaveLength(1);
    const rendered = result[0] as VNode;
    expect(rendered.tag).toBe('div');
    expect(rendered.getAttribute('class')).toBe('test');
  });

  it('should pass through VTextNode unchanged', () => {
    const text = new VTextNode('Hello world');
    const result = renderTemplate([text as any], {});
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
    expect((result[0] as VTextNode).text).toBe('Hello world');
  });

  it('should replace <span data-dyn="N"> with VCommentNode', () => {
    const span = new VNode('span');
    span.setAttribute('data-dyn', '0');
    const result = renderTemplate([span], {});
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(VCommentNode);
    expect((result[0] as unknown as VCommentNode).text).toBe('dyn-0');
  });

  it('should replace multiple data-dyn markers', () => {
    const span0 = new VNode('span');
    span0.setAttribute('data-dyn', '0');
    const span1 = new VNode('span');
    span1.setAttribute('data-dyn', '1');
    const span2 = new VNode('span');
    span2.setAttribute('data-dyn', '2');

    const result = renderTemplate([span0, span1, span2], {});
    expect(result).toHaveLength(3);
    expect((result[0] as unknown as VCommentNode).text).toBe('dyn-0');
    expect((result[1] as unknown as VCommentNode).text).toBe('dyn-1');
    expect((result[2] as unknown as VCommentNode).text).toBe('dyn-2');
  });

  it('should recursively render children', () => {
    const div = new VNode('div');
    const span = new VNode('span');
    span.setAttribute('data-dyn', '0');
    div.appendChild(span);

    const result = renderTemplate([div], {});
    expect(result).toHaveLength(1);
    const renderedDiv = result[0] as VNode;
    expect(renderedDiv.tag).toBe('div');
    expect(renderedDiv.children).toHaveLength(1);
    expect(renderedDiv.children[0]).toBeInstanceOf(VCommentNode);
    expect((renderedDiv.children[0] as unknown as VCommentNode).text).toBe('dyn-0');
  });

  it('should handle deeply nested children with mixed content', () => {
    const outer = new VNode('div');
    const inner = new VNode('p');
    const text = new VTextNode('Static text');
    const dynSpan = new VNode('span');
    dynSpan.setAttribute('data-dyn', '5');
    inner.appendChild(text);
    inner.appendChild(dynSpan);
    outer.appendChild(inner);

    const result = renderTemplate([outer], {});
    const renderedOuter = result[0] as VNode;
    const renderedInner = renderedOuter.children[0] as VNode;
    expect(renderedInner.tag).toBe('p');
    expect(renderedInner.children).toHaveLength(2);
    expect((renderedInner.children[0] as VTextNode).text).toBe('Static text');
    expect(renderedInner.children[1]).toBeInstanceOf(VCommentNode);
  });

  it('should clone attributes on rendered nodes', () => {
    const node = new VNode('div');
    node.setAttribute('data-px-el', '3');
    node.setAttribute('class', 'wrapper');
    const result = renderTemplate([node], {});
    const rendered = result[0] as VNode;
    expect(rendered.getAttribute('data-px-el')).toBe('3');
    expect(rendered.getAttribute('class')).toBe('wrapper');
  });

  it('should handle empty node list', () => {
    const result = renderTemplate([], {});
    expect(result).toEqual([]);
  });

  it('should handle nodes with no children', () => {
    const node = new VNode('hr');
    const result = renderTemplate([node], {});
    expect(result).toHaveLength(1);
    expect((result[0] as VNode).tag).toBe('hr');
    expect((result[0] as VNode).children).toHaveLength(0);
  });

  it('should only replace span elements with data-dyn (not other tags)', () => {
    const div = new VNode('div');
    div.setAttribute('data-dyn', '0');
    const result = renderTemplate([div], {});
    // div with data-dyn should NOT be replaced — only span tags are replaced
    expect(result).toHaveLength(1);
    expect((result[0] as VNode).tag).toBe('div');
    expect((result[0] as VNode).getAttribute('data-dyn')).toBe('0');
  });
});

describe('integration: renderToString with parsed HTML and renderTemplate', () => {
  it('should correctly render a component with mixed static and dynamic content', () => {
    const comp = createMockComponent({
      template: '<div class="app"><h1>Title</h1><span data-dyn="0"></span><p>Footer</p></div>',
      observedAttributes: ['text'],
    });
    registerComponent('polyx-integration', comp);
    const html = renderToString('polyx-integration', { text: 'Hello' });

    expect(html).toContain('polyx-integration');
    expect(html).toContain('data-polyx-hydrate');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<!--dyn-0-->');
    expect(html).toContain('<p>Footer</p>');
    expect(html).toContain('text="Hello"');
  });

  it('should correctly render a component with self-closing tags in template', () => {
    const comp = createMockComponent({
      template: '<div><br /><hr /><img /></div>',
      observedAttributes: [],
    });
    registerComponent('polyx-selfclose', comp);
    const html = renderToString('polyx-selfclose');

    expect(html).toContain('<br />');
    expect(html).toContain('<hr />');
    expect(html).toContain('<img />');
  });

  it('should render a component with nested same-name tags in template', () => {
    const comp = createMockComponent({
      template: '<div><div>Inner</div></div>',
      observedAttributes: [],
    });
    registerComponent('polyx-nested-div', comp);
    const html = renderToString('polyx-nested-div');

    expect(html).toContain('<div><div>Inner</div></div>');
  });
});

// =============================================================================
// Feature 2: SSR State Serialization, Instance IDs, and Suspense
// =============================================================================

describe('getNextInstanceId + resetInstanceCounters', () => {
  beforeEach(() => {
    resetInstanceCounters();
  });

  it('should start at 0 for a new tag name', () => {
    expect(getNextInstanceId('polyx-test')).toBe(0);
  });

  it('should auto-increment for the same tag name', () => {
    expect(getNextInstanceId('polyx-counter')).toBe(0);
    expect(getNextInstanceId('polyx-counter')).toBe(1);
    expect(getNextInstanceId('polyx-counter')).toBe(2);
  });

  it('should track separate counters for different tag names', () => {
    expect(getNextInstanceId('polyx-a')).toBe(0);
    expect(getNextInstanceId('polyx-b')).toBe(0);
    expect(getNextInstanceId('polyx-a')).toBe(1);
    expect(getNextInstanceId('polyx-b')).toBe(1);
  });

  it('should reset all counters to zero', () => {
    getNextInstanceId('polyx-x');
    getNextInstanceId('polyx-x');
    getNextInstanceId('polyx-y');
    resetInstanceCounters();
    expect(getNextInstanceId('polyx-x')).toBe(0);
    expect(getNextInstanceId('polyx-y')).toBe(0);
  });
});

describe('computeInitialState', () => {
  it('should return empty object when no _stateDefaults', () => {
    const comp: any = {};
    expect(computeInitialState(comp)).toEqual({});
  });

  it('should return _stateDefaults when no props override', () => {
    const comp: any = { _stateDefaults: { count: 0, name: 'world' } };
    expect(computeInitialState(comp)).toEqual({ count: 0, name: 'world' });
  });

  it('should override defaults with matching props', () => {
    const comp: any = { _stateDefaults: { count: 0, name: 'world' } };
    expect(computeInitialState(comp, { count: 10 })).toEqual({ count: 10, name: 'world' });
  });

  it('should not add props that are not in _stateDefaults', () => {
    const comp: any = { _stateDefaults: { count: 0 } };
    const state = computeInitialState(comp, { count: 5, extra: 'ignored' });
    expect(state).toEqual({ count: 5 });
    expect(state).not.toHaveProperty('extra');
  });

  it('should handle all state value types', () => {
    const comp: any = {
      _stateDefaults: {
        num: 42,
        str: 'hello',
        bool: false,
        nil: null,
        arr: [1, 2],
        obj: { a: 1 },
      }
    };
    const state = computeInitialState(comp);
    expect(state).toEqual({
      num: 42,
      str: 'hello',
      bool: false,
      nil: null,
      arr: [1, 2],
      obj: { a: 1 },
    });
  });

  it('should handle empty _stateDefaults', () => {
    const comp: any = { _stateDefaults: {} };
    expect(computeInitialState(comp)).toEqual({});
  });
});

describe('escapeJSON', () => {
  it('should escape < characters to prevent </script> injection', () => {
    const result = escapeJSON({ text: '</script>' });
    expect(result).not.toContain('</script>');
    expect(result).toContain('\\u003c');
    expect(result).toContain('\\u003e');
  });

  it('should escape > characters', () => {
    const result = escapeJSON({ val: 'a>b' });
    expect(result).toContain('\\u003e');
    expect(result).not.toContain('>');
  });

  it('should escape & characters', () => {
    const result = escapeJSON({ val: 'a&b' });
    expect(result).toContain('\\u0026');
    expect(result).not.toContain('&');
  });

  it('should handle nested objects', () => {
    const result = escapeJSON({ nested: { val: '<script>alert(1)</script>' } });
    expect(result).not.toContain('<script>');
    expect(result).toContain('\\u003c');
  });

  it('should return valid JSON content (parseable after unescaping)', () => {
    const state = { count: 0, name: 'test' };
    const result = escapeJSON(state);
    // The escaped string should still be parseable as JSON
    const parsed = JSON.parse(result);
    expect(parsed).toEqual(state);
  });

  it('should handle empty state object', () => {
    const result = escapeJSON({});
    expect(result).toBe('{}');
  });
});

describe('getStateDefaults with _stateDefaults', () => {
  it('should prefer _stateDefaults over observedAttributes', () => {
    const comp: any = {
      _stateDefaults: { count: 0, name: 'hello' },
      observedAttributes: ['count', 'name', 'extra'],
    };
    const defaults = getStateDefaults(comp);
    expect(defaults).toEqual({ count: 0, name: 'hello' });
    expect(defaults).not.toHaveProperty('extra');
  });

  it('should return a copy of _stateDefaults (not the same reference)', () => {
    const original = { count: 0 };
    const comp: any = { _stateDefaults: original };
    const defaults = getStateDefaults(comp);
    expect(defaults).toEqual(original);
    expect(defaults).not.toBe(original);
  });

  it('should fall back to observedAttributes when _stateDefaults is absent', () => {
    const comp: any = { observedAttributes: ['count'] };
    const defaults = getStateDefaults(comp);
    expect(defaults).toEqual({ count: undefined });
  });
});

describe('renderToString: instance IDs and state serialization', () => {
  beforeEach(() => {
    resetInstanceCounters();
  });

  it('should add data-polyx-instance attribute to rendered output', () => {
    const comp = createMockComponent({
      template: '<div>Content</div>',
      observedAttributes: [],
    });
    registerComponent('polyx-inst-test', comp);
    const html = renderToString('polyx-inst-test');
    expect(html).toContain('data-polyx-instance="0"');
  });

  it('should auto-increment instance IDs for the same component', () => {
    const comp = createMockComponent({
      template: '<div>Content</div>',
      observedAttributes: [],
    });
    registerComponent('polyx-inst-multi', comp);
    const html1 = renderToString('polyx-inst-multi');
    const html2 = renderToString('polyx-inst-multi');
    expect(html1).toContain('data-polyx-instance="0"');
    expect(html2).toContain('data-polyx-instance="1"');
  });

  it('should serialize state as a script tag when serializeState is true (default)', () => {
    const comp: any = {
      template: '<div>Stateful</div>',
      _stateDefaults: { count: 0, name: 'world' },
    };
    registerComponent('polyx-serialize', comp);
    const html = renderToString('polyx-serialize');
    expect(html).toContain('<script type="application/polyx-state"');
    expect(html).toContain('data-for="polyx-serialize"');
    expect(html).toContain('data-instance="0"');
    // State should be serialized as JSON
    expect(html).toContain('"count"');
    expect(html).toContain('"name"');
  });

  it('should not serialize state when serializeState is false', () => {
    const comp: any = {
      template: '<div>No State Script</div>',
      _stateDefaults: { count: 0 },
    };
    registerComponent('polyx-no-serialize', comp);
    const html = renderToString('polyx-no-serialize', {}, { serializeState: false });
    expect(html).not.toContain('<script type="application/polyx-state"');
  });

  it('should not emit state script tag when state is empty', () => {
    const comp: any = {
      template: '<div>Empty State</div>',
      _stateDefaults: {},
    };
    registerComponent('polyx-empty-state', comp);
    const html = renderToString('polyx-empty-state');
    // No state to serialize, so no script tag
    expect(html).not.toContain('<script type="application/polyx-state"');
  });

  it('should override state defaults with props in serialized state', () => {
    const comp: any = {
      template: '<div>Override</div>',
      _stateDefaults: { count: 0 },
    };
    registerComponent('polyx-override', comp);
    const html = renderToString('polyx-override', { count: 42 });
    // The serialized state should have the overridden value
    expect(html).toContain('"count":42');
  });
});

describe('renderToString: hydration strategy attribute', () => {
  beforeEach(() => {
    resetInstanceCounters();
  });

  it('should not add data-hydrate attribute when strategy is "load" (default)', () => {
    const comp: any = {
      template: '<div>Load</div>',
      _hydrationStrategy: 'load',
    };
    registerComponent('polyx-hyd-load', comp);
    const html = renderToString('polyx-hyd-load');
    expect(html).not.toContain('data-hydrate');
  });

  it('should add data-hydrate="none" when strategy is "none"', () => {
    const comp: any = {
      template: '<div>None</div>',
      _hydrationStrategy: 'none',
    };
    registerComponent('polyx-hyd-none', comp);
    const html = renderToString('polyx-hyd-none');
    expect(html).toContain('data-hydrate="none"');
  });

  it('should add data-hydrate="interaction" when strategy is "interaction"', () => {
    const comp: any = {
      template: '<div>Interaction</div>',
      _hydrationStrategy: 'interaction',
    };
    registerComponent('polyx-hyd-interact', comp);
    const html = renderToString('polyx-hyd-interact');
    expect(html).toContain('data-hydrate="interaction"');
  });

  it('should add data-hydrate="visible" when strategy is "visible"', () => {
    const comp: any = {
      template: '<div>Visible</div>',
      _hydrationStrategy: 'visible',
    };
    registerComponent('polyx-hyd-visible', comp);
    const html = renderToString('polyx-hyd-visible');
    expect(html).toContain('data-hydrate="visible"');
  });

  it('should add data-hydrate="idle" when strategy is "idle"', () => {
    const comp: any = {
      template: '<div>Idle</div>',
      _hydrationStrategy: 'idle',
    };
    registerComponent('polyx-hyd-idle', comp);
    const html = renderToString('polyx-hyd-idle');
    expect(html).toContain('data-hydrate="idle"');
  });

  it('should default to "load" when _hydrationStrategy is not set on class', () => {
    const comp: any = {
      template: '<div>Default</div>',
    };
    registerComponent('polyx-hyd-default', comp);
    const html = renderToString('polyx-hyd-default');
    // "load" is default, so no data-hydrate attribute
    expect(html).not.toContain('data-hydrate');
  });
});

describe('renderWithSuspense', () => {
  beforeEach(() => {
    resetInstanceCounters();
  });

  it('should render normally when no Promise is thrown', () => {
    const comp: any = {
      template: '<div>Normal</div>',
      observedAttributes: [],
    };
    registerComponent('polyx-suspense-normal', comp);

    const ctx: SuspenseRenderContext = {
      boundaryIdCounter: 0,
      pendingBoundaries: new Map(),
    };

    const html = renderWithSuspense('polyx-suspense-normal', {}, ctx);
    expect(html).toContain('Normal');
    expect(ctx.pendingBoundaries.size).toBe(0);
  });

  it('should catch thrown Promise and register a Suspense boundary', () => {
    // Register a component that will throw a Promise
    const promise = Promise.resolve('resolved');
    const throwingClass: any = {
      get template() {
        throw promise;
      },
      observedAttributes: [],
    };
    registerComponent('polyx-suspense-throw', throwingClass);

    const ctx: SuspenseRenderContext = {
      boundaryIdCounter: 0,
      pendingBoundaries: new Map(),
    };

    const html = renderWithSuspense('polyx-suspense-throw', {}, ctx);

    // Should return fallback HTML
    expect(html).toContain('data-suspense-id="0"');
    expect(html).toContain('Loading...');

    // Should have registered the boundary
    expect(ctx.boundaryIdCounter).toBe(1);
    expect(ctx.pendingBoundaries.size).toBe(1);
    expect(ctx.pendingBoundaries.has(0)).toBe(true);

    // Suppress unhandled rejection from the .then() chain inside renderWithSuspense
    ctx.pendingBoundaries.get(0)!.promise.catch(() => {});
  });

  it('should use custom fallback function when provided', () => {
    const promise = Promise.resolve('done');
    const throwingClass: any = {
      get template() {
        throw promise;
      },
    };
    registerComponent('polyx-suspense-custom-fb', throwingClass);

    const ctx: SuspenseRenderContext = {
      boundaryIdCounter: 0,
      pendingBoundaries: new Map(),
      fallbackFn: (id) => `<div class="skeleton" data-suspense-id="${id}">Custom Skeleton</div>`,
    };

    const html = renderWithSuspense('polyx-suspense-custom-fb', {}, ctx);
    expect(html).toContain('Custom Skeleton');
    expect(html).toContain('class="skeleton"');

    // Suppress unhandled rejection
    ctx.pendingBoundaries.get(0)!.promise.catch(() => {});
  });

  it('should re-throw non-Promise errors', () => {
    const throwingClass: any = {
      get template() {
        throw new Error('real error');
      },
    };
    registerComponent('polyx-suspense-error', throwingClass);

    const ctx: SuspenseRenderContext = {
      boundaryIdCounter: 0,
      pendingBoundaries: new Map(),
    };

    expect(() => renderWithSuspense('polyx-suspense-error', {}, ctx)).toThrow('real error');
  });

  it('should increment boundary ID counter for multiple Suspense boundaries', () => {
    const promise1 = Promise.resolve('a');
    const promise2 = Promise.resolve('b');

    const throwingClass1: any = {
      get template() { throw promise1; },
    };
    const throwingClass2: any = {
      get template() { throw promise2; },
    };
    registerComponent('polyx-suspense-multi-1', throwingClass1);
    registerComponent('polyx-suspense-multi-2', throwingClass2);

    const ctx: SuspenseRenderContext = {
      boundaryIdCounter: 0,
      pendingBoundaries: new Map(),
    };

    renderWithSuspense('polyx-suspense-multi-1', {}, ctx);
    renderWithSuspense('polyx-suspense-multi-2', {}, ctx);

    expect(ctx.boundaryIdCounter).toBe(2);
    expect(ctx.pendingBoundaries.size).toBe(2);
    expect(ctx.pendingBoundaries.has(0)).toBe(true);
    expect(ctx.pendingBoundaries.has(1)).toBe(true);

    // Suppress unhandled rejections
    ctx.pendingBoundaries.get(0)!.promise.catch(() => {});
    ctx.pendingBoundaries.get(1)!.promise.catch(() => {});
  });
});
