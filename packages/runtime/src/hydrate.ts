// Client-side hydration for SSR-rendered PolyX components
// Attaches event handlers and reactivity to pre-rendered HTML

/**
 * Hydrate all SSR-rendered PolyX components in the document.
 * Finds elements with data-polyx-hydrate attribute and activates them.
 */
export function hydrate(root: Element = document.documentElement): void {
  const hydrateTargets = root.querySelectorAll('[data-polyx-hydrate]');

  hydrateTargets.forEach(element => {
    hydrateElement(element as HTMLElement);
  });
}

/**
 * Hydrate a single SSR-rendered element.
 * This triggers the custom element's connectedCallback with existing DOM intact.
 */
function hydrateElement(element: HTMLElement): void {
  const tagName = element.tagName.toLowerCase();

  // Check if the custom element is defined
  const ceClass = customElements.get(tagName);
  if (!ceClass) {
    console.warn(`[PolyX Hydration] Custom element "${tagName}" not defined. Skipping.`);
    return;
  }

  // Mark as hydrating so the component knows to reuse existing DOM
  (element as any).__polyx_hydrating = true;

  // Remove the hydration marker
  element.removeAttribute('data-polyx-hydrate');

  // If the element was server-rendered as a plain tag (not yet upgraded),
  // trigger the upgrade by calling customElements.upgrade()
  if (!(element instanceof ceClass)) {
    customElements.upgrade(element);
  }

  // The element's connectedCallback will fire during upgrade.
  // The _mount() method will check __polyx_hydrating and reuse existing DOM
  // instead of replacing innerHTML.

  (element as any).__polyx_hydrating = false;
}

/**
 * Check if an element is being hydrated (SSR → client transition)
 */
export function isHydrating(element: HTMLElement): boolean {
  return !!(element as any).__polyx_hydrating;
}
