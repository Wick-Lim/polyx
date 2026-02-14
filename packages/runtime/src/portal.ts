// Portal support for PolyX components
// Renders children into a DOM node outside the component tree

/**
 * Declarative Portal: Custom Element that moves its children to a target container.
 *
 * Usage in JSX:
 *   <polyx-portal target={document.body}>
 *     <div class="modal">...</div>
 *   </polyx-portal>
 *
 *   <polyx-portal target="#modal-root">
 *     <div class="modal">...</div>
 *   </polyx-portal>
 */
export class PolyXPortal extends HTMLElement {
  private _target: Element | null = null;
  private _portalContainer: HTMLElement | null = null;
  private _observer: MutationObserver | null = null;

  // Accept target as property (Element or CSS selector string)
  get target(): Element | string | null {
    return this._target || this.getAttribute('target');
  }

  set target(value: Element | string | null) {
    if (value instanceof Element) {
      this._target = value;
    } else if (typeof value === 'string') {
      this._target = document.querySelector(value);
    } else {
      this._target = null;
    }
    if (this.isConnected) {
      this._moveChildren();
    }
  }

  connectedCallback() {
    // Resolve target from attribute if not set via property
    if (!this._target) {
      const targetAttr = this.getAttribute('target');
      if (targetAttr) {
        this._target = document.querySelector(targetAttr);
      }
    }

    // Hide the portal element itself
    this.style.display = 'contents';

    this._moveChildren();

    // Watch for dynamically added children
    this._observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          this._moveChildren();
        }
      }
    });
    this._observer.observe(this, { childList: true });
  }

  disconnectedCallback() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }

    // Clean up portal content
    if (this._portalContainer && this._portalContainer.parentNode) {
      this._portalContainer.parentNode.removeChild(this._portalContainer);
    }
    this._portalContainer = null;
  }

  private _moveChildren() {
    const target = this._target;
    if (!target) return;

    if (!this._portalContainer) {
      this._portalContainer = document.createElement('div');
      this._portalContainer.style.display = 'contents';
      this._portalContainer.setAttribute('data-polyx-portal', '');
      target.appendChild(this._portalContainer);
    }

    // Move children to portal container
    // Disconnect observer temporarily to avoid infinite loop
    this._observer?.disconnect();
    while (this.firstChild) {
      this._portalContainer.appendChild(this.firstChild);
    }
    // Reconnect observer
    if (this._observer) {
      this._observer.observe(this, { childList: true });
    }
  }
}

// Register the portal custom element
if (typeof customElements !== 'undefined' && !customElements.get('polyx-portal')) {
  customElements.define('polyx-portal', PolyXPortal);
}

/**
 * Imperative portal API: renders content into a container element.
 * Returns a Comment node as a placeholder in the original tree.
 *
 * Usage:
 *   const placeholder = createPortal(myNode, document.body);
 *   parentElement.appendChild(placeholder);
 */
export function createPortal(content: Node | string, container: Element): Comment {
  const placeholder = document.createComment('polyx-portal');

  if (typeof content === 'string') {
    const textNode = document.createTextNode(content);
    container.appendChild(textNode);
  } else {
    container.appendChild(content);
  }

  return placeholder;
}
