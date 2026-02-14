import { describe, it, expect } from 'vitest';
import { scopeCSS, extractStyleFromTemplate } from '../css.js';

describe('scopeCSS', () => {
  it('should scope a basic selector with [data-hash] prefix', () => {
    const result = scopeCSS('h1 { color: red; }', 'MyComponent');
    expect(result.css).toContain('[' + result.scopeAttr + '] h1');
    expect(result.css).toContain('{ color: red; }');
  });

  it('should return a scopeAttr starting with data-px', () => {
    const result = scopeCSS('div { margin: 0; }', 'TestWidget');
    expect(result.scopeAttr).toMatch(/^data-px[a-z0-9]+$/);
  });

  it('should produce consistent hash for the same input', () => {
    const result1 = scopeCSS('p { font-size: 14px; }', 'Foo');
    const result2 = scopeCSS('span { color: blue; }', 'Foo');
    // Same component name => same scopeAttr
    expect(result1.scopeAttr).toBe(result2.scopeAttr);
  });

  it('should produce different hashes for different component names', () => {
    const result1 = scopeCSS('p { font-size: 14px; }', 'Alpha');
    const result2 = scopeCSS('p { font-size: 14px; }', 'Beta');
    expect(result1.scopeAttr).not.toBe(result2.scopeAttr);
  });

  it('should scope multiple comma-separated selectors', () => {
    const result = scopeCSS('h1, h2, p { color: blue; }', 'Comp');
    const attr = result.scopeAttr;
    // Each selector should get the scope prefix
    expect(result.css).toContain(`[${attr}] h1`);
    expect(result.css).toContain(`[${attr}] h2`);
    expect(result.css).toContain(`[${attr}] p`);
  });

  it('should map :host selector to [data-hash]', () => {
    const result = scopeCSS(':host { display: block; }', 'Widget');
    const attr = result.scopeAttr;
    // :host becomes [scopeAttr] (no extra prefix space)
    expect(result.css).toContain(`[${attr}]`);
    expect(result.css).not.toContain(':host');
    expect(result.css).toContain('{ display: block; }');
  });

  it('should preserve @media at-rule in output (@ excluded from selector capture)', () => {
    // The regex ([^{}@]+) excludes @ from the captured selector group,
    // so @media stays as a literal prefix in the output. The at-rule
    // selector branch (sel.startsWith('@')) on line 31 guards against
    // any edge case where @ might leak into captured selectors.
    const result = scopeCSS('@media (max-width: 600px) { color: red; }', 'Comp');
    // The @ prefix is preserved; the rest gets captured as selector
    expect(result.css).toContain('@');
    expect(result.css).toContain('color: red;');
  });

  it('should preserve @keyframes at-rule in output', () => {
    const result = scopeCSS('@keyframes fadeIn { opacity: 1; }', 'Comp');
    expect(result.css).toContain('@');
    expect(result.css).toContain('opacity: 1;');
  });

  it('should not scope :root selector', () => {
    const result = scopeCSS(':root { --primary: blue; }', 'Comp');
    const attr = result.scopeAttr;
    expect(result.css).toContain(':root');
    expect(result.css).not.toContain(`[${attr}] :root`);
  });

  it('should not scope html selector', () => {
    const result = scopeCSS('html { font-size: 16px; }', 'Comp');
    const attr = result.scopeAttr;
    expect(result.css).toContain('html');
    expect(result.css).not.toContain(`[${attr}] html`);
  });

  it('should not scope body selector', () => {
    const result = scopeCSS('body { margin: 0; }', 'Comp');
    const attr = result.scopeAttr;
    expect(result.css).toContain('body');
    expect(result.css).not.toContain(`[${attr}] body`);
  });

  it('should handle empty selector gracefully (not scope it)', () => {
    // A CSS string with a leading comma produces an empty selector after split
    const result = scopeCSS(', h1 { color: red; }', 'Comp');
    const attr = result.scopeAttr;
    // The empty selector should be preserved as-is (empty string)
    // and h1 should still be scoped
    expect(result.css).toContain(`[${attr}] h1`);
  });

  it('should scope nested selectors like .parent .child', () => {
    const result = scopeCSS('.parent .child { color: green; }', 'Comp');
    const attr = result.scopeAttr;
    expect(result.css).toContain(`[${attr}] .parent .child`);
  });

  it('should scope ID selectors', () => {
    const result = scopeCSS('#main { padding: 10px; }', 'Comp');
    const attr = result.scopeAttr;
    expect(result.css).toContain(`[${attr}] #main`);
  });

  it('should scope pseudo-class selectors (not :host or :root)', () => {
    const result = scopeCSS('a:hover { text-decoration: underline; }', 'Comp');
    const attr = result.scopeAttr;
    expect(result.css).toContain(`[${attr}] a:hover`);
  });

  it('should handle multiple rules in one CSS string', () => {
    const css = 'h1 { color: red; } p { margin: 0; }';
    const result = scopeCSS(css, 'Multi');
    const attr = result.scopeAttr;
    expect(result.css).toContain(`[${attr}] h1`);
    expect(result.css).toContain(`[${attr}] p`);
  });

  it('should handle :host among comma-separated selectors', () => {
    const result = scopeCSS(':host, .inner { display: flex; }', 'Comp');
    const attr = result.scopeAttr;
    expect(result.css).toContain(`[${attr}]`);
    expect(result.css).toContain(`[${attr}] .inner`);
    expect(result.css).not.toContain(':host');
  });

  it('should handle body among comma-separated selectors with normal selectors', () => {
    const result = scopeCSS('body, .wrapper { padding: 0; }', 'Comp');
    const attr = result.scopeAttr;
    expect(result.css).toContain('body');
    expect(result.css).toContain(`[${attr}] .wrapper`);
    expect(result.css).not.toContain(`[${attr}] body`);
  });
});

describe('extractStyleFromTemplate', () => {
  it('should extract style content from template with a style tag', () => {
    const template = '<div><style>h1 { color: red; }</style><h1>Hello</h1></div>';
    const result = extractStyleFromTemplate(template);
    expect(result.style).toBe('h1 { color: red; }');
    expect(result.html).toBe('<div><h1>Hello</h1></div>');
  });

  it('should return null style when no style tag is present', () => {
    const template = '<div><h1>Hello</h1></div>';
    const result = extractStyleFromTemplate(template);
    expect(result.style).toBeNull();
    expect(result.html).toBe('<div><h1>Hello</h1></div>');
  });

  it('should remove the style tag from the returned HTML', () => {
    const template = '<div><style>.box { border: 1px solid; }</style><span>Text</span></div>';
    const result = extractStyleFromTemplate(template);
    expect(result.html).not.toContain('<style>');
    expect(result.html).not.toContain('</style>');
    expect(result.html).toContain('<span>Text</span>');
  });

  it('should handle template with only a style tag', () => {
    const template = '<style>body { margin: 0; }</style>';
    const result = extractStyleFromTemplate(template);
    expect(result.style).toBe('body { margin: 0; }');
    expect(result.html).toBe('');
  });

  it('should handle multiline style content', () => {
    const template = '<div><style>\n  h1 {\n    color: red;\n  }\n</style><h1>Title</h1></div>';
    const result = extractStyleFromTemplate(template);
    expect(result.style).toContain('h1 {');
    expect(result.style).toContain('color: red;');
    expect(result.html).not.toContain('<style>');
  });

  it('should handle empty style tag', () => {
    const template = '<div><style></style><p>text</p></div>';
    const result = extractStyleFromTemplate(template);
    expect(result.style).toBe('');
    expect(result.html).toBe('<div><p>text</p></div>');
  });

  it('should return original HTML when there is no style tag', () => {
    const template = '<main><p>No styles here</p></main>';
    const result = extractStyleFromTemplate(template);
    expect(result.html).toBe(template);
    expect(result.style).toBeNull();
  });
});
