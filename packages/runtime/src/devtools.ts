// DevTools for PolyX components
// Browser extension not required — activate with initDevTools()

export interface ComponentDebugInfo {
  tagName: string;
  element: HTMLElement;
  renderCount: number;
  lastRenderTimeMs: number;
  averageRenderTimeMs: number;
  state: Record<string, any>;
  props: Record<string, any>;
}

export interface ProfilingResult {
  durationMs: number;
  componentUpdates: {
    tagName: string;
    renderTimeMs: number;
    timestamp: number;
  }[];
  slowRenders: {
    tagName: string;
    renderTimeMs: number;
    timestamp: number;
  }[];
}

const SLOW_RENDER_THRESHOLD_MS = 16; // 1 frame at 60fps

class PolyXDevTools {
  private _components = new Map<HTMLElement, {
    ref: WeakRef<HTMLElement>;
    tagName: string;
    renderCount: number;
    totalRenderTimeMs: number;
    lastRenderTimeMs: number;
  }>();
  private _profiling = false;
  private _profilingStartTime = 0;
  private _profilingUpdates: { tagName: string; renderTimeMs: number; timestamp: number }[] = [];
  private _panel: HTMLElement | null = null;

  // Called by PolyXElement on connectedCallback
  _onMount(element: HTMLElement): void {
    this._components.set(element, {
      ref: new WeakRef(element),
      tagName: element.tagName.toLowerCase(),
      renderCount: 0,
      totalRenderTimeMs: 0,
      lastRenderTimeMs: 0,
    });
  }

  // Called by PolyXElement after _updateDynamicParts
  _onUpdate(element: HTMLElement, renderTimeMs: number): void {
    let info = this._components.get(element);
    if (!info) {
      // Component mounted before devtools was initialized
      info = {
        ref: new WeakRef(element),
        tagName: element.tagName.toLowerCase(),
        renderCount: 0,
        totalRenderTimeMs: 0,
        lastRenderTimeMs: 0,
      };
      this._components.set(element, info);
    }

    info.renderCount++;
    info.lastRenderTimeMs = renderTimeMs;
    info.totalRenderTimeMs += renderTimeMs;

    if (this._profiling) {
      this._profilingUpdates.push({
        tagName: info.tagName,
        renderTimeMs,
        timestamp: performance.now(),
      });
    }
  }

  // Called by PolyXElement on disconnectedCallback
  _onUnmount(element: HTMLElement): void {
    this._components.delete(element);
  }

  /**
   * Get the full component tree as a flat list of debug info.
   */
  getComponentTree(): ComponentDebugInfo[] {
    const result: ComponentDebugInfo[] = [];
    this._cleanupStaleRefs();

    for (const [element, info] of this._components) {
      if (!element.isConnected) continue;
      result.push({
        tagName: info.tagName,
        element,
        renderCount: info.renderCount,
        lastRenderTimeMs: info.lastRenderTimeMs,
        averageRenderTimeMs: info.renderCount > 0 ? info.totalRenderTimeMs / info.renderCount : 0,
        state: (element as any)._state ? { ...(element as any)._state } : {},
        props: (element as any)._props ? { ...(element as any)._props } : {},
      });
    }

    return result;
  }

  /**
   * Inspect a specific element for debug info.
   */
  inspectComponent(element: HTMLElement): ComponentDebugInfo | null {
    const info = this._components.get(element);
    if (!info) return null;

    return {
      tagName: info.tagName,
      element,
      renderCount: info.renderCount,
      lastRenderTimeMs: info.lastRenderTimeMs,
      averageRenderTimeMs: info.renderCount > 0 ? info.totalRenderTimeMs / info.renderCount : 0,
      state: (element as any)._state ? { ...(element as any)._state } : {},
      props: (element as any)._props ? { ...(element as any)._props } : {},
    };
  }

  /**
   * Get components with renders slower than threshold.
   */
  getSlowRenders(thresholdMs: number = SLOW_RENDER_THRESHOLD_MS): ComponentDebugInfo[] {
    return this.getComponentTree().filter(c => c.lastRenderTimeMs > thresholdMs);
  }

  /**
   * Start profiling component renders.
   */
  startProfiling(): void {
    this._profiling = true;
    this._profilingStartTime = performance.now();
    this._profilingUpdates = [];
  }

  /**
   * Stop profiling and return results.
   */
  stopProfiling(): ProfilingResult {
    this._profiling = false;
    const durationMs = performance.now() - this._profilingStartTime;
    const updates = this._profilingUpdates;
    this._profilingUpdates = [];

    return {
      durationMs,
      componentUpdates: updates,
      slowRenders: updates.filter(u => u.renderTimeMs > SLOW_RENDER_THRESHOLD_MS),
    };
  }

  /**
   * Show a floating debug panel with component info.
   */
  showPanel(): void {
    if (this._panel) return;

    const panel = document.createElement('div');
    panel.setAttribute('data-polyx-devtools-panel', '');
    panel.style.cssText = `
      position: fixed; bottom: 0; right: 0; width: 360px; max-height: 50vh;
      background: #1a1a2e; color: #e0e0e0; font-family: monospace; font-size: 12px;
      border-top: 2px solid #6c63ff; border-left: 2px solid #6c63ff;
      overflow: auto; z-index: 99998; padding: 0;
      box-shadow: -4px -4px 12px rgba(0,0,0,0.3);
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      padding: 8px 12px; background: #16213e; display: flex;
      justify-content: space-between; align-items: center;
      position: sticky; top: 0; z-index: 1;
    `;
    header.innerHTML = '<span style="color:#6c63ff;font-weight:bold;">PolyX DevTools</span>';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'X';
    closeBtn.style.cssText = `
      background: none; border: 1px solid #666; color: #e0e0e0;
      cursor: pointer; padding: 2px 8px; border-radius: 3px;
    `;
    closeBtn.onclick = () => this.hidePanel();
    header.appendChild(closeBtn);

    const content = document.createElement('div');
    content.style.cssText = 'padding: 8px 12px;';

    panel.appendChild(header);
    panel.appendChild(content);
    document.body.appendChild(panel);
    this._panel = panel;

    this._updatePanel(content);
    // Auto-refresh every 1s
    const interval = setInterval(() => {
      if (!this._panel || !this._panel.isConnected) {
        clearInterval(interval);
        return;
      }
      this._updatePanel(content);
    }, 1000);
  }

  /**
   * Hide the debug panel.
   */
  hidePanel(): void {
    if (this._panel && this._panel.parentNode) {
      this._panel.parentNode.removeChild(this._panel);
    }
    this._panel = null;
  }

  private _updatePanel(content: HTMLElement): void {
    const components = this.getComponentTree();

    let html = `<div style="margin-bottom:8px;color:#aaa;">Components: ${components.length}</div>`;

    if (components.length === 0) {
      html += '<div style="color:#666;">No components mounted</div>';
    } else {
      for (const comp of components) {
        const isSlow = comp.lastRenderTimeMs > SLOW_RENDER_THRESHOLD_MS;
        const color = isSlow ? '#ff6b6b' : '#e0e0e0';
        const avgMs = comp.averageRenderTimeMs.toFixed(2);
        const lastMs = comp.lastRenderTimeMs.toFixed(2);
        html += `
          <div style="padding:4px 0;border-bottom:1px solid #333;color:${color};">
            <span style="color:#6c63ff;">&lt;${comp.tagName}&gt;</span>
            <span style="color:#aaa;margin-left:8px;">renders: ${comp.renderCount}</span>
            <span style="margin-left:8px;">avg: ${avgMs}ms</span>
            <span style="margin-left:8px;">last: ${lastMs}ms</span>
            ${isSlow ? '<span style="color:#ff6b6b;margin-left:8px;">SLOW</span>' : ''}
          </div>
        `;
      }
    }

    content.innerHTML = html;
  }

  private _cleanupStaleRefs(): void {
    for (const [element] of this._components) {
      if (!element.isConnected) {
        this._components.delete(element);
      }
    }
  }
}

/**
 * Initialize DevTools. Call once at app startup.
 * Similar pattern to initHMR().
 */
export function initDevTools(): PolyXDevTools {
  if (typeof window !== 'undefined') {
    if (!(window as any).__POLYX_DEVTOOLS__) {
      (window as any).__POLYX_DEVTOOLS__ = new PolyXDevTools();
    }
    return (window as any).__POLYX_DEVTOOLS__;
  }
  // SSR/non-browser fallback
  return new PolyXDevTools();
}

/**
 * Get the DevTools instance if initialized, null otherwise.
 * Used by PolyXElement for zero-overhead check.
 */
export function getDevTools(): PolyXDevTools | null {
  if (typeof window !== 'undefined') {
    return (window as any).__POLYX_DEVTOOLS__ || null;
  }
  return null;
}
