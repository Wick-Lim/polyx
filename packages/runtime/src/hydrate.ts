// Client-side hydration for SSR-rendered PolyX components
// Supports full hydration, resumable hydration, and selective hydration strategies

export type HydrationStrategy = 'load' | 'visible' | 'idle' | 'interaction' | 'none';

export interface HydrateOptions {
  /** Hydration mode: 'resume' reuses serialized state, 'full' re-executes (default: auto-detect) */
  mode?: 'resume' | 'full';
}

/**
 * Hydrate all SSR-rendered PolyX components in the document.
 * Finds elements with data-polyx-hydrate attribute and activates them.
 */
export function hydrate(root: Element = document.documentElement, options: HydrateOptions = {}): void {
  // Collect serialized state from script tags
  const stateMap = collectSerializedState(root);
  const mode = options.mode ?? (stateMap.size > 0 ? 'resume' : 'full');

  const hydrateTargets = root.querySelectorAll('[data-polyx-hydrate]');

  hydrateTargets.forEach(element => {
    const el = element as HTMLElement;
    const strategy = (el.getAttribute('data-hydrate') || 'load') as HydrationStrategy;

    switch (strategy) {
      case 'none':
        // Static component — remove markers, no JS execution
        el.removeAttribute('data-polyx-hydrate');
        el.removeAttribute('data-hydrate');
        break;

      case 'load':
        // Immediate hydration
        if (mode === 'resume') {
          hydrateResumable(el, stateMap);
        } else {
          hydrateElement(el);
        }
        break;

      case 'visible':
        // Hydrate when element enters viewport
        scheduleVisibleHydration(el, mode, stateMap);
        break;

      case 'idle':
        // Hydrate during idle time
        scheduleIdleHydration(el, mode, stateMap);
        break;

      case 'interaction':
        // Hydrate on first user interaction
        scheduleInteractionHydration(el, mode, stateMap);
        break;
    }
  });
}

/**
 * Collect serialized state from <script type="application/polyx-state"> tags.
 * Returns a Map keyed by "tagName:instanceId" with parsed state objects.
 * Removes the script tags after collection.
 */
export function collectSerializedState(root: Element): Map<string, Record<string, any>> {
  const stateMap = new Map<string, Record<string, any>>();
  const scripts = root.querySelectorAll('script[type="application/polyx-state"]');

  scripts.forEach(script => {
    const tagName = script.getAttribute('data-for');
    const instanceId = script.getAttribute('data-instance');
    if (tagName && instanceId !== null) {
      try {
        const state = JSON.parse(script.textContent || '{}');
        stateMap.set(`${tagName}:${instanceId}`, state);
      } catch {
        // Invalid JSON — skip
      }
    }
    script.remove();
  });

  return stateMap;
}

/**
 * Hydrate a single SSR-rendered element in resumable mode.
 * Restores serialized state and attaches only event handlers (no re-render).
 */
function hydrateResumable(element: HTMLElement, stateMap: Map<string, Record<string, any>>): void {
  const tagName = element.tagName.toLowerCase();

  const ceClass = customElements.get(tagName);
  if (!ceClass) {
    console.warn(`[PolyX Hydration] Custom element "${tagName}" not defined. Skipping.`);
    return;
  }

  // Look up serialized state
  const instanceId = element.getAttribute('data-polyx-instance') || '0';
  const stateKey = `${tagName}:${instanceId}`;
  const serializedState = stateMap.get(stateKey);

  // Set flags for resumable hydration
  (element as any).__polyx_hydrating = true;
  (element as any).__polyx_resume = true;
  if (serializedState) {
    (element as any).__polyx_serialized_state = serializedState;
  }

  // Remove hydration markers
  element.removeAttribute('data-polyx-hydrate');
  element.removeAttribute('data-hydrate');

  // Trigger upgrade if needed
  if (!(element instanceof ceClass)) {
    customElements.upgrade(element);
  }

  (element as any).__polyx_hydrating = false;
  (element as any).__polyx_resume = false;
}

/**
 * Hydrate a single SSR-rendered element (full mode).
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
  element.removeAttribute('data-hydrate');

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
 * Schedule hydration when element becomes visible (IntersectionObserver)
 */
function scheduleVisibleHydration(
  element: HTMLElement,
  mode: 'resume' | 'full',
  stateMap: Map<string, Record<string, any>>
): void {
  if (typeof IntersectionObserver === 'undefined') {
    // Fallback: hydrate immediately
    if (mode === 'resume') hydrateResumable(element, stateMap);
    else hydrateElement(element);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.disconnect();
          if (mode === 'resume') hydrateResumable(entry.target as HTMLElement, stateMap);
          else hydrateElement(entry.target as HTMLElement);
          break;
        }
      }
    },
    { rootMargin: '200px' }
  );

  observer.observe(element);
}

/**
 * Schedule hydration during browser idle time (requestIdleCallback)
 */
function scheduleIdleHydration(
  element: HTMLElement,
  mode: 'resume' | 'full',
  stateMap: Map<string, Record<string, any>>
): void {
  const callback = () => {
    if (mode === 'resume') hydrateResumable(element, stateMap);
    else hydrateElement(element);
  };

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(callback);
  } else {
    // Fallback: setTimeout
    setTimeout(callback, 50);
  }
}

/**
 * Schedule hydration on first user interaction (click, focus, touchstart, pointerover)
 */
function scheduleInteractionHydration(
  element: HTMLElement,
  mode: 'resume' | 'full',
  stateMap: Map<string, Record<string, any>>
): void {
  const events = ['click', 'focus', 'touchstart', 'pointerover'] as const;

  const handler = (event: Event) => {
    // Remove all listeners
    for (const evt of events) {
      element.removeEventListener(evt, handler, { capture: true } as EventListenerOptions);
    }

    // Hydrate
    if (mode === 'resume') hydrateResumable(element, stateMap);
    else hydrateElement(element);

    // Re-dispatch the event so the now-hydrated component handles it
    if (event.type === 'click' || event.type === 'touchstart') {
      const target = event.target as HTMLElement;
      if (target) {
        // Use a microtask to ensure hydration completes first
        queueMicrotask(() => {
          target.dispatchEvent(new Event(event.type, { bubbles: true, cancelable: true }));
        });
      }
    }
  };

  for (const evt of events) {
    element.addEventListener(evt, handler, { capture: true, once: false } as AddEventListenerOptions);
  }
}

/**
 * Check if an element is being hydrated (SSR → client transition)
 */
export function isHydrating(element: HTMLElement): boolean {
  return !!(element as any).__polyx_hydrating;
}
