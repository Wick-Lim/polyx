/**
 * E2E test helpers for PolyX component testing.
 * Provides utilities for flushing microtask queues, mounting components,
 * dispatching events, and querying the DOM.
 */

/** Flush a single microtask (one round of queueMicrotask). */
export function flush(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

/**
 * Flush multiple microtask rounds.
 * PolyX update chain: state batch → layout effects → effects.
 * 3 rounds covers the full pipeline.
 */
export async function flushAll(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await flush();
  }
}

/** Create an element by tag name, append to body, and flush. */
export async function mount(tagName: string): Promise<HTMLElement> {
  const el = document.createElement(tagName);
  document.body.appendChild(el);
  await flushAll();
  return el;
}

/** Dispatch a click event on an element and flush. */
export async function click(el: Element): Promise<void> {
  el.dispatchEvent(new Event('click', { bubbles: true }));
  await flushAll();
}

/** Clean up: remove all body children and style tags. */
export function cleanup(): void {
  document.body.innerHTML = '';
  document.querySelectorAll('style').forEach((s) => s.remove());
}

/** querySelector shorthand on a root element. */
export function q(root: Element | Document, selector: string): Element | null {
  return root.querySelector(selector);
}

/** querySelectorAll shorthand on a root element. */
export function qAll(root: Element | Document, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector));
}
