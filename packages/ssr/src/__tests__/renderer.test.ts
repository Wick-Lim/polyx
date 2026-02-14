import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerComponent, renderToString, renderPage, getTemplateHTML, getStateDefaults, parseHTML, renderTemplate } from '../renderer.js';
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
    // Register a fresh component for each test
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
