// HMR runtime support for PolyX
// Manages component registry and hot replacement

interface ComponentRegistry {
  [tagName: string]: {
    elementClass: typeof HTMLElement;
    instances: Set<WeakRef<HTMLElement>>;
  };
}

class PolyXHMR {
  private registry: ComponentRegistry = {};

  // Register a component class (called during initial define)
  register(tagName: string, elementClass: typeof HTMLElement) {
    this.registry[tagName] = {
      elementClass,
      instances: new Set(),
    };
  }

  // Track a component instance
  trackInstance(tagName: string, instance: HTMLElement) {
    if (this.registry[tagName]) {
      this.registry[tagName].instances.add(new WeakRef(instance));
    }
  }

  // Handle HMR update from Vite
  update(newModule: Record<string, any>) {
    for (const exportName of Object.keys(newModule)) {
      const exportValue = newModule[exportName];

      // Skip non-class exports
      if (typeof exportValue !== 'function' || !exportValue.prototype) continue;

      // Find the tag name from the class (check if it has a template)
      const tagName = this.findTagName(exportValue);
      if (!tagName || !this.registry[tagName]) continue;

      const entry = this.registry[tagName];

      // Update the prototype of the existing class
      // This allows new _render methods to take effect
      const oldProto = entry.elementClass.prototype;
      const newProto = exportValue.prototype;

      // Copy new methods to old prototype
      for (const key of Object.getOwnPropertyNames(newProto)) {
        if (key === 'constructor') continue;
        const descriptor = Object.getOwnPropertyDescriptor(newProto, key);
        if (descriptor) {
          Object.defineProperty(oldProto, key, descriptor);
        }
      }

      // Copy static properties (like template)
      for (const key of Object.getOwnPropertyNames(exportValue)) {
        if (['prototype', 'length', 'name'].includes(key)) continue;
        const descriptor = Object.getOwnPropertyDescriptor(exportValue, key);
        if (descriptor) {
          Object.defineProperty(entry.elementClass, key, descriptor);
        }
      }

      // Re-render all tracked instances
      const aliveInstances = new Set<WeakRef<HTMLElement>>();
      for (const ref of entry.instances) {
        const instance = ref.deref();
        if (instance && instance.isConnected) {
          aliveInstances.add(ref);
          // Trigger re-render
          if ('_updateDynamicParts' in instance) {
            (instance as any)._updateDynamicParts();
          }
        }
      }
      entry.instances = aliveInstances;

      console.log(`[PolyX HMR] Updated <${tagName}>`);
    }
  }

  private findTagName(elementClass: any): string | null {
    for (const [tagName, entry] of Object.entries(this.registry)) {
      // Match by class name pattern
      const expectedClassName = tagName.replace('polyx-', '').replace(/-/g, '') + 'element';
      if (elementClass.name?.toLowerCase() === expectedClassName) {
        return tagName;
      }
    }
    return null;
  }
}

// Initialize HMR in development
export function initHMR(): void {
  if (typeof window !== 'undefined' && !(window as any).__POLYX_HMR__) {
    (window as any).__POLYX_HMR__ = new PolyXHMR();
  }
}

export function getHMR(): PolyXHMR | null {
  if (typeof window !== 'undefined') {
    return (window as any).__POLYX_HMR__ || null;
  }
  return null;
}
