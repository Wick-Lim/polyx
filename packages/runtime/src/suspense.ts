// Suspense + lazy() for PolyX
// Provides React-like code splitting and async data fetching with fallback UI

const SUSPENSE_SYMBOL = Symbol('polyx-suspense');

interface LazyState<T> {
  status: 'pending' | 'resolved' | 'rejected';
  result?: T;
  error?: any;
  promise?: Promise<T>;
}

// Check if a thrown value is a Suspense promise
export function isSuspensePromise(thrown: unknown): thrown is Promise<any> {
  return (
    thrown instanceof Promise ||
    (typeof thrown === 'object' && thrown !== null && 'then' in thrown)
  );
}

// Walk up the DOM tree to find the nearest PolyXSuspense boundary
export function findSuspenseBoundary(element: HTMLElement): PolyXSuspense | null {
  let node: Node | null = element.parentNode;
  while (node) {
    if (node instanceof PolyXSuspense) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

// lazy() — lazily load a component module
export function lazy<T extends { new (...args: any[]): HTMLElement }>(
  loader: () => Promise<{ default: T }>
): T {
  const state: LazyState<T> = { status: 'pending' };

  // Start loading immediately
  const loadPromise = loader().then(
    (module) => {
      state.status = 'resolved';
      state.result = module.default;
      return module.default;
    },
    (error) => {
      state.status = 'rejected';
      state.error = error;
      throw error;
    }
  );
  state.promise = loadPromise as any;

  // Create a proxy class that either renders the real component or throws for Suspense
  class LazyElement extends HTMLElement {
    private _resolved = false;
    private _pendingProps: Record<string, any> = {};

    connectedCallback() {
      if (state.status === 'resolved') {
        this._upgrade();
      } else if (state.status === 'rejected') {
        throw state.error;
      } else {
        // Throw the promise so Suspense boundary can catch it
        throw state.promise!;
      }
    }

    _setProp(name: string, value: any) {
      this._pendingProps[name] = value;
      if (this._resolved) {
        const inner = this.firstElementChild as any;
        if (inner && '_setProp' in inner) {
          inner._setProp(name, value);
        }
      }
    }

    _setProps(props: Record<string, any>) {
      Object.assign(this._pendingProps, props);
      if (this._resolved) {
        const inner = this.firstElementChild as any;
        if (inner && '_setProps' in inner) {
          inner._setProps(props);
        }
      }
    }

    private _upgrade() {
      if (this._resolved) return;
      this._resolved = true;

      const RealClass = state.result!;
      const tagName = (RealClass as any).__polyxTagName;
      if (tagName) {
        const realEl = document.createElement(tagName);
        if ('_setProps' in realEl) {
          (realEl as any)._setProps(this._pendingProps);
        } else {
          (realEl as any).__pendingPolyXProps = { ...this._pendingProps };
        }
        // Move children
        while (this.firstChild) {
          realEl.appendChild(this.firstChild);
        }
        this.appendChild(realEl);
      }
    }
  }

  return LazyElement as any;
}

// PolyXSuspense — catches Suspense promises from children and shows fallback
export class PolyXSuspense extends HTMLElement {
  private _fallback: Node | null = null;
  private _pendingPromises: Set<Promise<any>> = new Set();
  private _childrenSnapshot: Node[] = [];
  private _isSuspended = false;

  connectedCallback() {
    // Extract fallback from attribute or slot
    const fallbackAttr = this.getAttribute('fallback');
    if (fallbackAttr) {
      this._fallback = document.createTextNode(fallbackAttr);
    }
  }

  // Set the fallback content
  set fallback(node: Node | string | null) {
    if (typeof node === 'string') {
      this._fallback = document.createTextNode(node);
    } else {
      this._fallback = node;
    }
  }

  _setProp(name: string, value: any) {
    if (name === 'fallback') {
      this.fallback = value;
    }
  }

  _setProps(props: Record<string, any>) {
    if ('fallback' in props) {
      this.fallback = props.fallback;
    }
  }

  // Called by component.ts when a child throws a promise
  _handleSuspend(promise: Promise<any>, child: HTMLElement): void {
    this._pendingPromises.add(promise);

    if (!this._isSuspended) {
      this._isSuspended = true;
      // Snapshot current children
      this._childrenSnapshot = Array.from(this.childNodes);
      // Hide children
      this._childrenSnapshot.forEach(node => {
        if (node instanceof HTMLElement) {
          (node as any).__polyxSuspenseDisplay = node.style.display;
          node.style.display = 'none';
        }
      });
      // Show fallback
      if (this._fallback) {
        const fallbackClone = this._fallback.cloneNode(true);
        (fallbackClone as any).__polyxFallback = true;
        this.appendChild(fallbackClone);
      }
    }

    promise.then(
      () => this._onPromiseResolved(promise, child),
      () => this._onPromiseResolved(promise, child)
    );
  }

  private _onPromiseResolved(promise: Promise<any>, child: HTMLElement): void {
    this._pendingPromises.delete(promise);

    if (this._pendingPromises.size === 0 && this._isSuspended) {
      this._isSuspended = false;
      // Remove fallback
      Array.from(this.childNodes).forEach(node => {
        if ((node as any).__polyxFallback) {
          this.removeChild(node);
        }
      });
      // Restore children visibility
      this._childrenSnapshot.forEach(node => {
        if (node instanceof HTMLElement) {
          node.style.display = (node as any).__polyxSuspenseDisplay || '';
          delete (node as any).__polyxSuspenseDisplay;
        }
      });
      this._childrenSnapshot = [];

      // Re-render the child that was suspended (it should now resolve)
      if (child.isConnected && '_updateDynamicParts' in child) {
        (child as any)._updateDynamicParts();
      }
    }
  }
}

// Register the Suspense element
if (typeof customElements !== 'undefined' && !customElements.get('polyx-suspense')) {
  customElements.define('polyx-suspense', PolyXSuspense);
}
