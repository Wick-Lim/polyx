// Server-Side Renderer for PolyX components
// Renders compiled PolyX components to HTML strings on the server

import { compile } from '@polyx/compiler';
import { VNode, VTextNode, VCommentNode } from './vdom.js';

export interface SSROptions {
  /** Component JSX source code */
  source?: string;
  /** Pre-compiled component class (if already compiled) */
  componentClass?: any;
}

export interface SSRRenderOptions {
  /** Whether to serialize component state as JSON script tags (default: true) */
  serializeState?: boolean;
}

export interface SuspenseRenderContext {
  /** Auto-incrementing boundary ID counter */
  boundaryIdCounter: number;
  /** Map of pending Suspense boundaries */
  pendingBoundaries: Map<number, { promise: Promise<string>; fallbackHTML: string }>;
  /** Custom fallback HTML generator */
  fallbackFn?: (boundaryId: number) => string;
}

// Component registry for SSR
const componentRegistry = new Map<string, any>();

/**
 * Register a compiled component class for SSR rendering
 */
export function registerComponent(tagName: string, componentClass: any): void {
  componentRegistry.set(tagName, componentClass);
}

/**
 * Render a component to an HTML string
 *
 * @param tagName - The custom element tag name (e.g., "polyx-counter")
 * @param props - Props to pass to the component
 * @param options - SSR render options
 * @returns HTML string
 */
export function renderToString(tagName: string, props: Record<string, any> = {}, options: SSRRenderOptions = {}): string {
  const componentClass = componentRegistry.get(tagName);
  if (!componentClass) {
    throw new Error(`Component "${tagName}" not registered. Use registerComponent() first.`);
  }

  // Get the template HTML from the class
  const templateHTML = getTemplateHTML(componentClass);
  if (!templateHTML) {
    return `<${tagName}></${tagName}>`;
  }

  // Parse template into virtual DOM
  const root = parseHTML(templateHTML);

  // Apply static attributes from props
  const result = new VNode(tagName);

  // Add hydration marker
  result.setAttribute('data-polyx-hydrate', '');

  // Add instance ID for state serialization
  const instanceId = getNextInstanceId(tagName);
  result.setAttribute('data-polyx-instance', String(instanceId));

  // Add hydration strategy attribute
  const strategy: string = componentClass._hydrationStrategy ?? 'load';
  if (strategy !== 'load') {
    result.setAttribute('data-hydrate', strategy);
  }

  // Copy props as attributes for primitive values
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      if (typeof value === 'boolean') {
        if (value) result.setAttribute(key, '');
      } else {
        result.setAttribute(key, String(value));
      }
    }
  }

  // Get initial state values from the component
  const stateDefaults = getStateDefaults(componentClass);

  // Render template with state applied
  const renderedContent = renderTemplate(root, { ...stateDefaults, ...props });

  // Set inner content from template
  for (const child of renderedContent) {
    result.appendChild(child);
  }

  let html = result.toHTML();

  // Serialize state as JSON script tag for resumable hydration
  if (options.serializeState !== false) {
    const state = computeInitialState(componentClass, props);
    if (Object.keys(state).length > 0) {
      html += `<script type="application/polyx-state" data-for="${tagName}" data-instance="${instanceId}">${escapeJSON(state)}</script>`;
    }
  }

  return html;
}

/**
 * Render a component with Suspense boundary awareness.
 * If the render throws a Promise, it registers a Suspense boundary and returns fallback HTML.
 */
export function renderWithSuspense(
  tagName: string,
  props: Record<string, any>,
  ctx: SuspenseRenderContext
): string {
  try {
    return renderToString(tagName, props);
  } catch (thrown: any) {
    if (thrown && typeof thrown.then === 'function') {
      // Promise thrown → Suspense boundary
      const boundaryId = ctx.boundaryIdCounter++;
      const fallbackHTML = ctx.fallbackFn
        ? ctx.fallbackFn(boundaryId)
        : `<div data-suspense-id="${boundaryId}" style="display:contents">Loading...</div>`;

      ctx.pendingBoundaries.set(boundaryId, {
        promise: thrown.then(() => renderToString(tagName, props)),
        fallbackHTML,
      });
      return fallbackHTML;
    }
    throw thrown;
  }
}

/**
 * Render a full page with component
 */
export function renderPage(options: {
  title?: string;
  head?: string;
  bodyTag?: string;
  bodyProps?: Record<string, any>;
  scripts?: string[];
}): string {
  const {
    title = 'PolyX App',
    head = '',
    bodyTag = '',
    bodyProps = {},
    scripts = [],
  } = options;

  const bodyHTML = bodyTag
    ? renderToString(bodyTag, bodyProps)
    : '';

  const scriptTags = scripts
    .map(src => `<script type="module" src="${src}"></script>`)
    .join('\n    ');

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    ${head}
  </head>
  <body>
    ${bodyHTML}
    ${scriptTags}
  </body>
</html>`;
}

// Extract template HTML from a component class (exported for streaming SSR)
export function getTemplateHTML(componentClass: any): string | null {
  const template = componentClass.template;
  if (!template) return null;

  // In SSR, template might be stored as a string property
  if (typeof template === 'string') return template;

  // If it has innerHTML (from createTemplate), use that
  if (template.innerHTML) return template.innerHTML;

  // If it has content.innerHTML
  if (template.content?.innerHTML) return template.content.innerHTML;

  return null;
}

// Extract default state values from a compiled component class (exported for streaming SSR)
export function getStateDefaults(componentClass: any): Record<string, any> {
  const defaults: Record<string, any> = {};

  // Use _stateDefaults if available (new compiler output)
  if (componentClass._stateDefaults) {
    return { ...componentClass._stateDefaults };
  }

  // Fallback: Check observedAttributes for state names
  const attrs = componentClass.observedAttributes;
  if (Array.isArray(attrs)) {
    for (const attr of attrs) {
      defaults[attr] = undefined;
    }
  }

  return defaults;
}

// Instance ID counters per tag name
const instanceCounters = new Map<string, number>();

/**
 * Get the next instance ID for a given tag name (auto-incrementing)
 */
export function getNextInstanceId(tagName: string): number {
  const current = instanceCounters.get(tagName) ?? 0;
  instanceCounters.set(tagName, current + 1);
  return current;
}

/**
 * Reset all instance counters (useful between SSR requests)
 */
export function resetInstanceCounters(): void {
  instanceCounters.clear();
}

/**
 * Compute initial state from _stateDefaults and props
 */
export function computeInitialState(componentClass: any, props: Record<string, any> = {}): Record<string, any> {
  const defaults = componentClass._stateDefaults ?? {};
  const state: Record<string, any> = {};

  for (const [key, value] of Object.entries(defaults)) {
    // Props can override state defaults
    state[key] = key in props ? props[key] : value;
  }

  return state;
}

/**
 * Escape JSON for safe embedding in a <script> tag.
 * Prevents </script> injection.
 */
export function escapeJSON(state: Record<string, any>): string {
  return JSON.stringify(state)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

// Simple HTML parser for templates → VNode tree (exported for streaming SSR)
export function parseHTML(html: string): VNode[] {
  const results: VNode[] = [];
  let pos = 0;

  while (pos < html.length) {
    if (html[pos] === '<') {
      if (html.startsWith('<!--', pos)) {
        // Comment
        const end = html.indexOf('-->', pos);
        if (end === -1) break;
        // Skip comments in SSR output
        pos = end + 3;
        continue;
      }

      if (html[pos + 1] === '/') {
        // Closing tag — skip (handled by opening tag parser)
        const end = html.indexOf('>', pos);
        if (end === -1) break;
        pos = end + 1;
        continue;
      }

      // Opening tag
      const tagMatch = html.slice(pos).match(/^<([a-zA-Z][a-zA-Z0-9-]*)/);
      if (!tagMatch) {
        pos++;
        continue;
      }

      const tagName = tagMatch[1];
      const node = new VNode(tagName);
      pos += tagMatch[0].length;

      // Parse attributes
      while (pos < html.length && html[pos] !== '>' && !(html[pos] === '/' && html[pos + 1] === '>')) {
        // Skip whitespace
        if (/\s/.test(html[pos])) {
          pos++;
          continue;
        }

        // Parse attribute
        const attrMatch = html.slice(pos).match(/^([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:="([^"]*)")?/);
        if (attrMatch) {
          node.setAttribute(attrMatch[1], attrMatch[2] ?? '');
          pos += attrMatch[0].length;
        } else {
          pos++;
        }
      }

      // Self-closing?
      const selfClosing = html[pos] === '/' && html[pos + 1] === '>';
      if (selfClosing) {
        pos += 2;
      } else {
        pos++; // skip '>'

        // Parse children until closing tag
        const closingTag = `</${tagName}>`;
        const closingIdx = findClosingTag(html, pos, tagName);
        if (closingIdx !== -1) {
          const innerHTML = html.slice(pos, closingIdx);
          const children = parseHTML(innerHTML);
          for (const child of children) {
            node.appendChild(child);
          }
          pos = closingIdx + closingTag.length;
        }
      }

      results.push(node);
    } else {
      // Text content
      const nextTag = html.indexOf('<', pos);
      const text = nextTag === -1 ? html.slice(pos) : html.slice(pos, nextTag);
      if (text.trim()) {
        results.push(new VNode('__text__'));
        const textNode = new VTextNode(text);
        results[results.length - 1] = textNode as any;
      }
      pos = nextTag === -1 ? html.length : nextTag;
    }
  }

  return results;
}

// Find the matching closing tag, handling nesting
function findClosingTag(html: string, startPos: number, tagName: string): number {
  let depth = 1;
  let pos = startPos;
  const openPattern = new RegExp(`<${tagName}[\\s/>]`, 'i');
  const closeStr = `</${tagName}>`;

  while (pos < html.length && depth > 0) {
    const nextOpen = html.indexOf(`<${tagName}`, pos);
    const nextClose = html.indexOf(closeStr, pos);

    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      // Check it's actually an opening tag (not a different tag starting with same prefix)
      const charAfter = html[nextOpen + tagName.length + 1];
      if (charAfter === '>' || charAfter === ' ' || charAfter === '/' || charAfter === '\n') {
        depth++;
      }
      pos = nextOpen + tagName.length + 1;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      pos = nextClose + closeStr.length;
    }
  }

  return -1;
}

// Render parsed template nodes, replacing dynamic markers with values (exported for streaming SSR)
export function renderTemplate(nodes: VNode[], state: Record<string, any>): (VNode | VTextNode)[] {
  const results: (VNode | VTextNode)[] = [];

  for (const node of nodes) {
    if (node instanceof VTextNode) {
      results.push(node);
      continue;
    }

    // Skip dynamic marker spans — they become placeholder comments in SSR
    if (node.tag === 'span' && node.attributes.has('data-dyn')) {
      const dynIdx = node.getAttribute('data-dyn');
      const comment = new VCommentNode(`dyn-${dynIdx}`);
      results.push(comment as any);
      continue;
    }

    // Clone node with rendered children
    const rendered = new VNode(node.tag);
    for (const [key, value] of node.attributes) {
      // Skip dynamic markers in SSR — they'll be used during hydration
      rendered.setAttribute(key, value);
    }

    // Recursively render children
    const children = renderTemplate(node.children as VNode[], state);
    for (const child of children) {
      rendered.appendChild(child);
    }

    results.push(rendered);
  }

  return results;
}
