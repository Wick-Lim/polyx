// Context API for dependency injection without prop drilling
import { assertCurrentInstance, getNextHookIndex } from './hooks-internals.js';

export interface PolyXContext<T> {
  _id: string;
  _defaultValue: T;
  Provider: string; // Tag name for the provider custom element
}

let contextIdCounter = 0;

export function createContext<T>(defaultValue: T): PolyXContext<T> {
  const id = `__polyx_ctx_${++contextIdCounter}`;
  const providerTagName = `polyx-ctx-provider-${contextIdCounter}`;

  // Define the provider custom element
  class PolyXContextProvider extends HTMLElement {
    private _value: T = defaultValue;
    private _subscribers: Set<() => void> = new Set();

    get value(): T {
      return this._value;
    }

    set value(newValue: T) {
      if (this._value !== newValue) {
        this._value = newValue;
        this._notifySubscribers();
      }
    }

    _setProp(name: string, val: any) {
      if (name === 'value') {
        this.value = val;
      }
    }

    _setProps(props: Record<string, any>) {
      if ('value' in props) {
        this.value = props.value;
      }
    }

    subscribe(callback: () => void): () => void {
      this._subscribers.add(callback);
      return () => this._subscribers.delete(callback);
    }

    private _notifySubscribers() {
      this._subscribers.forEach(cb => cb());
    }

    get contextId() { return id; }
  }

  if (typeof customElements !== 'undefined' && !customElements.get(providerTagName)) {
    customElements.define(providerTagName, PolyXContextProvider);
  }

  return {
    _id: id,
    _defaultValue: defaultValue,
    Provider: providerTagName,
  };
}

// useContext hook — traverses DOM tree to find nearest Provider (cached after first call)
export function useContext<T>(context: PolyXContext<T>): T {
  const instance = assertCurrentInstance();
  const index = getNextHookIndex();

  // On subsequent calls, read cached provider directly (no DOM traversal)
  if (instance.hooks.length > index) {
    const hook = instance.hooks[index];
    if (hook && hook.provider) {
      return hook.provider.value;
    }
    return context._defaultValue;
  }

  // First call: walk DOM to find provider
  const element = instance.element;
  let provider: any = null;
  let node: Node | null = element;
  while (node) {
    if (node instanceof HTMLElement && 'contextId' in node && (node as any).contextId === context._id) {
      provider = node;
      break;
    }
    node = node.parentNode;
  }

  if (!provider) {
    instance.hooks.push({ provider: null, unsubscribe: null });
    return context._defaultValue;
  }

  const unsubscribe = provider.subscribe(() => {
    instance.render();
  });
  instance.hooks.push({
    provider,
    unsubscribe,
    cleanup: unsubscribe,
  });

  return provider.value;
}
