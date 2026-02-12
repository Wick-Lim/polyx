// Virtual DOM for server-side rendering (Node.js, no real DOM)

export class VNode {
  tag: string;
  attributes: Map<string, string> = new Map();
  children: (VNode | VTextNode)[] = [];
  parent: VNode | null = null;

  constructor(tag: string) {
    this.tag = tag;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  appendChild(child: VNode | VTextNode) {
    child.parent = this;
    this.children.push(child);
  }

  get innerHTML(): string {
    return this.children.map(c => c.toHTML()).join('');
  }

  set innerHTML(html: string) {
    this.children = [];
    // Simple HTML parser for SSR template content
    if (html) {
      const textNode = new VTextNode(html);
      textNode.parent = this;
      this.children.push(textNode);
    }
  }

  toHTML(): string {
    const attrs = Array.from(this.attributes.entries())
      .map(([k, v]) => v === '' ? k : `${k}="${escapeAttr(v)}"`)
      .join(' ');

    const attrStr = attrs ? ` ${attrs}` : '';

    // Self-closing tags
    const selfClosing = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
    if (selfClosing.has(this.tag) && this.children.length === 0) {
      return `<${this.tag}${attrStr} />`;
    }

    const childHTML = this.children.map(c => c.toHTML()).join('');
    return `<${this.tag}${attrStr}>${childHTML}</${this.tag}>`;
  }
}

export class VTextNode {
  text: string;
  parent: VNode | null = null;

  constructor(text: string) {
    this.text = text;
  }

  toHTML(): string {
    return escapeHTML(this.text);
  }
}

export class VCommentNode {
  text: string;
  parent: VNode | null = null;

  constructor(text: string) {
    this.text = text;
  }

  toHTML(): string {
    return `<!--${this.text}-->`;
  }
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}
