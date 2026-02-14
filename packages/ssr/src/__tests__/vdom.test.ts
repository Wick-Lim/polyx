import { describe, it, expect } from 'vitest';
import { VNode, VTextNode, VCommentNode } from '../vdom.js';

describe('VNode', () => {
  describe('constructor', () => {
    it('should create a VNode with the given tag', () => {
      const node = new VNode('div');
      expect(node.tag).toBe('div');
      expect(node.attributes).toBeInstanceOf(Map);
      expect(node.attributes.size).toBe(0);
      expect(node.children).toEqual([]);
      expect(node.parent).toBeNull();
    });
  });

  describe('setAttribute', () => {
    it('should set an attribute with a value', () => {
      const node = new VNode('div');
      node.setAttribute('class', 'container');
      expect(node.attributes.get('class')).toBe('container');
    });

    it('should set an attribute with an empty value (boolean attribute)', () => {
      const node = new VNode('input');
      node.setAttribute('disabled', '');
      expect(node.attributes.get('disabled')).toBe('');
    });

    it('should overwrite an existing attribute', () => {
      const node = new VNode('div');
      node.setAttribute('id', 'first');
      node.setAttribute('id', 'second');
      expect(node.attributes.get('id')).toBe('second');
    });
  });

  describe('getAttribute', () => {
    it('should return the attribute value when it exists', () => {
      const node = new VNode('div');
      node.setAttribute('class', 'box');
      expect(node.getAttribute('class')).toBe('box');
    });

    it('should return null for a non-existent attribute', () => {
      const node = new VNode('div');
      expect(node.getAttribute('nonexistent')).toBeNull();
    });

    it('should return empty string for boolean attributes', () => {
      const node = new VNode('input');
      node.setAttribute('checked', '');
      expect(node.getAttribute('checked')).toBe('');
    });
  });

  describe('removeAttribute', () => {
    it('should remove an existing attribute', () => {
      const node = new VNode('div');
      node.setAttribute('class', 'box');
      expect(node.getAttribute('class')).toBe('box');
      node.removeAttribute('class');
      expect(node.getAttribute('class')).toBeNull();
      expect(node.attributes.size).toBe(0);
    });

    it('should do nothing when removing a non-existent attribute', () => {
      const node = new VNode('div');
      node.removeAttribute('nonexistent');
      expect(node.attributes.size).toBe(0);
    });
  });

  describe('appendChild', () => {
    it('should add a child VNode and set its parent', () => {
      const parent = new VNode('div');
      const child = new VNode('span');
      parent.appendChild(child);
      expect(parent.children).toHaveLength(1);
      expect(parent.children[0]).toBe(child);
      expect(child.parent).toBe(parent);
    });

    it('should add a child VTextNode and set its parent', () => {
      const parent = new VNode('p');
      const text = new VTextNode('Hello');
      parent.appendChild(text);
      expect(parent.children).toHaveLength(1);
      expect(parent.children[0]).toBe(text);
      expect(text.parent).toBe(parent);
    });

    it('should add multiple children in order', () => {
      const parent = new VNode('ul');
      const li1 = new VNode('li');
      const li2 = new VNode('li');
      parent.appendChild(li1);
      parent.appendChild(li2);
      expect(parent.children).toHaveLength(2);
      expect(parent.children[0]).toBe(li1);
      expect(parent.children[1]).toBe(li2);
    });
  });

  describe('innerHTML getter', () => {
    it('should return empty string for no children', () => {
      const node = new VNode('div');
      expect(node.innerHTML).toBe('');
    });

    it('should return the HTML of all children', () => {
      const div = new VNode('div');
      const span = new VNode('span');
      const text = new VTextNode('Hello');
      span.appendChild(text);
      div.appendChild(span);
      expect(div.innerHTML).toBe('<span>Hello</span>');
    });

    it('should concatenate HTML of multiple children', () => {
      const div = new VNode('div');
      const text1 = new VTextNode('Hello ');
      const strong = new VNode('strong');
      const text2 = new VTextNode('World');
      strong.appendChild(text2);
      div.appendChild(text1);
      div.appendChild(strong);
      expect(div.innerHTML).toBe('Hello <strong>World</strong>');
    });
  });

  describe('innerHTML setter', () => {
    it('should clear existing children and add a text node', () => {
      const div = new VNode('div');
      const existingChild = new VNode('span');
      div.appendChild(existingChild);
      expect(div.children).toHaveLength(1);

      div.innerHTML = '<p>New content</p>';
      expect(div.children).toHaveLength(1);
      expect(div.children[0]).toBeInstanceOf(VTextNode);
      expect((div.children[0] as VTextNode).text).toBe('<p>New content</p>');
      expect(div.children[0].parent).toBe(div);
    });

    it('should clear children and not add a text node for empty string', () => {
      const div = new VNode('div');
      div.appendChild(new VNode('span'));
      expect(div.children).toHaveLength(1);

      div.innerHTML = '';
      expect(div.children).toHaveLength(0);
    });

    it('should clear children and add text node for plain text', () => {
      const div = new VNode('div');
      div.innerHTML = 'Hello World';
      expect(div.children).toHaveLength(1);
      expect((div.children[0] as VTextNode).text).toBe('Hello World');
    });
  });

  describe('toHTML', () => {
    it('should render a simple tag with no attributes or children', () => {
      const node = new VNode('div');
      expect(node.toHTML()).toBe('<div></div>');
    });

    it('should render a tag with attributes that have values', () => {
      const node = new VNode('div');
      node.setAttribute('class', 'container');
      node.setAttribute('id', 'main');
      expect(node.toHTML()).toBe('<div class="container" id="main"></div>');
    });

    it('should render boolean attributes (empty value) as just the name', () => {
      const node = new VNode('input');
      node.setAttribute('type', 'checkbox');
      node.setAttribute('checked', '');
      // input is self-closing with no children
      expect(node.toHTML()).toBe('<input type="checkbox" checked />');
    });

    it('should render children inside the tag', () => {
      const div = new VNode('div');
      const text = new VTextNode('Hello');
      div.appendChild(text);
      expect(div.toHTML()).toBe('<div>Hello</div>');
    });

    it('should render nested elements', () => {
      const div = new VNode('div');
      const p = new VNode('p');
      const text = new VTextNode('Nested');
      p.appendChild(text);
      div.appendChild(p);
      expect(div.toHTML()).toBe('<div><p>Nested</p></div>');
    });

    it('should escape attribute values with special characters', () => {
      const node = new VNode('div');
      node.setAttribute('data-value', 'a&b"c');
      expect(node.toHTML()).toBe('<div data-value="a&amp;b&quot;c"></div>');
    });

    describe('self-closing tags', () => {
      const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];

      for (const tag of selfClosingTags) {
        it(`should render <${tag}> as self-closing`, () => {
          const node = new VNode(tag);
          expect(node.toHTML()).toBe(`<${tag} />`);
        });
      }

      it('should render self-closing tag with attributes', () => {
        const node = new VNode('img');
        node.setAttribute('src', 'image.png');
        node.setAttribute('alt', 'An image');
        expect(node.toHTML()).toBe('<img src="image.png" alt="An image" />');
      });

      it('should not self-close a void element that has children', () => {
        // Edge case: if a self-closing tag somehow has children, it should render as a normal tag
        const node = new VNode('br');
        const text = new VTextNode('unexpected');
        node.appendChild(text);
        // children.length > 0, so it won't be self-closing
        expect(node.toHTML()).toBe('<br>unexpected</br>');
      });
    });
  });
});

describe('VTextNode', () => {
  describe('constructor', () => {
    it('should create a VTextNode with the given text', () => {
      const node = new VTextNode('Hello World');
      expect(node.text).toBe('Hello World');
      expect(node.parent).toBeNull();
    });
  });

  describe('toHTML', () => {
    it('should return the text as-is when no special characters', () => {
      const node = new VTextNode('Hello World');
      expect(node.toHTML()).toBe('Hello World');
    });

    it('should escape ampersands', () => {
      const node = new VTextNode('A & B');
      expect(node.toHTML()).toBe('A &amp; B');
    });

    it('should escape less-than signs', () => {
      const node = new VTextNode('x < y');
      expect(node.toHTML()).toBe('x &lt; y');
    });

    it('should escape greater-than signs', () => {
      const node = new VTextNode('x > y');
      expect(node.toHTML()).toBe('x &gt; y');
    });

    it('should escape all HTML entities in combination', () => {
      const node = new VTextNode('<script>alert("x&y")</script>');
      expect(node.toHTML()).toBe('&lt;script&gt;alert("x&amp;y")&lt;/script&gt;');
    });

    it('should return empty string for empty text', () => {
      const node = new VTextNode('');
      expect(node.toHTML()).toBe('');
    });
  });
});

describe('VCommentNode', () => {
  describe('constructor', () => {
    it('should create a VCommentNode with the given text', () => {
      const node = new VCommentNode('This is a comment');
      expect(node.text).toBe('This is a comment');
      expect(node.parent).toBeNull();
    });
  });

  describe('toHTML', () => {
    it('should wrap text in HTML comment markers', () => {
      const node = new VCommentNode('comment text');
      expect(node.toHTML()).toBe('<!--comment text-->');
    });

    it('should handle empty comment text', () => {
      const node = new VCommentNode('');
      expect(node.toHTML()).toBe('<!---->');
    });

    it('should handle dynamic marker style text', () => {
      const node = new VCommentNode('dyn-0');
      expect(node.toHTML()).toBe('<!--dyn-0-->');
    });
  });

  describe('parent', () => {
    it('should have parent set when appended to a VNode', () => {
      const div = new VNode('div');
      const comment = new VCommentNode('test');
      // VCommentNode is not typically appended via appendChild (which expects VNode|VTextNode),
      // but its parent field can be set manually
      comment.parent = div;
      expect(comment.parent).toBe(div);
    });
  });
});
