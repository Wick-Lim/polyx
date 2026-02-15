// DOM Recycling Pool — reuse removed DOM nodes to reduce GC pressure
// Opt-in via enableDOMRecycling(maxPerTag)

class DOMPool {
  private _pools: Map<string, Node[]> = new Map();
  private _maxPerTag: number;

  constructor(maxPerTag: number) {
    this._maxPerTag = maxPerTag;
  }

  acquire(tagName: string): Node | null {
    const pool = this._pools.get(tagName);
    if (pool && pool.length > 0) {
      return pool.pop()!;
    }
    return null;
  }

  release(node: Node): void {
    if (!(node instanceof HTMLElement)) return;
    const tagName = node.tagName.toLowerCase();
    let pool = this._pools.get(tagName);
    if (!pool) {
      pool = [];
      this._pools.set(tagName, pool);
    }
    if (pool.length >= this._maxPerTag) return; // Pool full
    this._cleanNode(node);
    pool.push(node);
  }

  private _cleanNode(node: HTMLElement): void {
    // Remove all attributes except tag-intrinsic ones
    const attrs = [...node.attributes];
    for (const attr of attrs) {
      node.removeAttribute(attr.name);
    }

    // Clear innerHTML
    node.innerHTML = '';

    // Remove PolyX internal properties
    const keys = Object.keys(node);
    for (const key of keys) {
      if (key.startsWith('__polyx_')) {
        delete (node as any)[key];
      }
    }

    // Reset PolyX element internals if it's a PolyX component
    if ('_state' in node) {
      (node as any)._state = {};
      (node as any)._props = {};
      (node as any)._hasMounted = false;
      (node as any)._isConnected = false;
      (node as any)._pendingUpdate = false;
      (node as any)._valueMarkers = [];
      (node as any)._valueCache = [];
      (node as any)._elements = [];
      if ((node as any)._instance) {
        (node as any)._instance.hooks = [];
        (node as any)._instance.hookIndex = 0;
        (node as any)._instance.effects = [];
        (node as any)._instance.layoutEffects = [];
      }
    }
  }

  clear(): void {
    this._pools.clear();
  }

  get size(): number {
    let total = 0;
    for (const pool of this._pools.values()) {
      total += pool.length;
    }
    return total;
  }

  poolSizeFor(tagName: string): number {
    return this._pools.get(tagName)?.length || 0;
  }
}

let globalPool: DOMPool | null = null;

export function enableDOMRecycling(maxPerTag: number = 100): void {
  globalPool = new DOMPool(maxPerTag);
}

export function disableDOMRecycling(): void {
  if (globalPool) {
    globalPool.clear();
  }
  globalPool = null;
}

export function acquireNode(tagName: string): Node | null {
  return globalPool ? globalPool.acquire(tagName) : null;
}

export function releaseNode(node: Node): void {
  if (globalPool) {
    globalPool.release(node);
  }
}

export function clearPool(): void {
  if (globalPool) {
    globalPool.clear();
  }
}

export function isPoolEnabled(): boolean {
  return globalPool !== null;
}

export function getPoolSize(): number {
  return globalPool ? globalPool.size : 0;
}

export function getPoolSizeFor(tagName: string): number {
  return globalPool ? globalPool.poolSizeFor(tagName) : 0;
}
