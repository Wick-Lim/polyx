import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PolyXErrorBoundary } from '../error-boundary.js';
import { PolyXElement, createTemplate, clearTemplateCache } from '../component.js';

let tagCounter = 0;

function uniqueTag(prefix = 'test-eb'): string {
  return `${prefix}-${++tagCounter}`;
}

/**
 * Define a concrete subclass of PolyXErrorBoundary for testing.
 * `renderImpl` controls what _render does, and `renderErrorImpl` controls
 * what renderError does.
 */
function defineErrorBoundaryComponent(options: {
  tagName?: string;
  templateHTML?: string;
  renderImpl?: (el: any) => void;
  renderErrorImpl?: (el: any, error: Error, info: any) => void;
}): string {
  const tagName = options.tagName || uniqueTag();
  const templateHTML = options.templateHTML || '<div><span data-dyn="0"></span></div>';
  const renderImpl = options.renderImpl || (() => {});
  const renderErrorImpl = options.renderErrorImpl || ((el: any, error: Error) => {
    el.innerHTML = `<div class="error">${error.message}</div>`;
  });

  class TestErrorBoundary extends PolyXErrorBoundary {
    static template = createTemplate(templateHTML);

    _render() {
      renderImpl(this);
    }

    renderError(error: Error, info: any) {
      renderErrorImpl(this, error, info);
    }
  }

  customElements.define(tagName, TestErrorBoundary);
  return tagName;
}

beforeEach(() => {
  clearTemplateCache();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('PolyXErrorBoundary', () => {
  describe('normal rendering (no error)', () => {
    it('should call _render via super._updateDynamicParts()', () => {
      const renderFn = vi.fn();
      const tagName = defineErrorBoundaryComponent({
        renderImpl: renderFn,
      });

      const el = document.createElement(tagName);
      document.body.appendChild(el);

      // _render is called during mount via _updateDynamicParts
      expect(renderFn).toHaveBeenCalled();
    });

    it('should mount template content normally', () => {
      const tagName = defineErrorBoundaryComponent({
        templateHTML: '<div>Normal Content</div>',
      });

      const el = document.createElement(tagName);
      document.body.appendChild(el);

      expect(el.innerHTML).toContain('Normal Content');
    });
  });

  describe('error handling', () => {
    it('should catch errors from super._updateDynamicParts and set error state', () => {
      const renderErrorFn = vi.fn();
      const tagName = defineErrorBoundaryComponent({
        renderErrorImpl: renderErrorFn,
      });

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      // Now make super._updateDynamicParts throw by stubbing PolyXElement.prototype._updateDynamicParts
      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('render failed');
      };

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      expect(el._hasError).toBe(true);
      expect(el._error).toBeInstanceOf(Error);
      expect(el._error!.message).toBe('render failed');
      expect(el._errorInfo).toBeDefined();
      expect(el._errorInfo!.componentName).toBe(tagName);
      expect(el._errorInfo!.error).toBe(el._error);
    });

    it('should call renderError with the error and error info', () => {
      const renderErrorFn = vi.fn();
      const tagName = defineErrorBoundaryComponent({
        renderErrorImpl: renderErrorFn,
      });

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);
      renderErrorFn.mockClear();

      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('test error');
      };

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      expect(renderErrorFn).toHaveBeenCalledTimes(1);
      const [, error, info] = renderErrorFn.mock.calls[0]; // [el, error, info]
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('test error');
      expect(info.componentName).toBe(tagName);
      expect(info.error).toBe(error);
    });

    it('should wrap non-Error thrown values in an Error', () => {
      const renderErrorFn = vi.fn();
      const tagName = defineErrorBoundaryComponent({
        renderErrorImpl: renderErrorFn,
      });

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw 'string error'; // eslint-disable-line no-throw-literal
      };

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      expect(el._error).toBeInstanceOf(Error);
      expect(el._error!.message).toBe('string error');
    });

    it('should wrap number thrown value in an Error', () => {
      const tagName = defineErrorBoundaryComponent({});

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw 42; // eslint-disable-line no-throw-literal
      };

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      expect(el._error).toBeInstanceOf(Error);
      expect(el._error!.message).toBe('42');
    });

    it('should log error to console.error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const tagName = defineErrorBoundaryComponent({});

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('logged error');
      };

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PolyX Error Boundary]'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should call renderError (not super._updateDynamicParts) on subsequent updates after an error', () => {
      const renderErrorFn = vi.fn();
      const tagName = defineErrorBoundaryComponent({
        renderErrorImpl: renderErrorFn,
      });

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      // Put the element into error state
      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('broken');
      };

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      expect(el._hasError).toBe(true);
      renderErrorFn.mockClear();

      // Spy on super to ensure it's NOT called
      const superSpy = vi.spyOn(PolyXElement.prototype, '_updateDynamicParts');

      // Trigger another _updateDynamicParts while in error state
      el._updateDynamicParts();

      expect(renderErrorFn).toHaveBeenCalledTimes(1);
      // super._updateDynamicParts should NOT be called
      expect(superSpy).not.toHaveBeenCalled();

      superSpy.mockRestore();
    });
  });

  describe('resetError', () => {
    it('should clear error state and re-render normally', () => {
      const renderFn = vi.fn();
      const renderErrorFn = vi.fn();
      const tagName = defineErrorBoundaryComponent({
        renderImpl: renderFn,
        renderErrorImpl: renderErrorFn,
      });

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      // Put the element into error state
      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('initial error');
      };

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      // Verify error state is set
      expect(el._hasError).toBe(true);
      expect(el._error).not.toBeNull();
      expect(el._errorInfo).not.toBeNull();

      renderFn.mockClear();
      renderErrorFn.mockClear();

      // Reset error - should trigger normal render via _updateDynamicParts -> super._updateDynamicParts -> _render
      el.resetError();

      // Error state should be cleared
      expect(el._hasError).toBe(false);
      expect(el._error).toBeNull();
      expect(el._errorInfo).toBeNull();

      // _render should have been called (via normal path through super._updateDynamicParts)
      expect(renderFn).toHaveBeenCalled();
      // renderError should NOT have been called
      expect(renderErrorFn).not.toHaveBeenCalled();
    });

    it('should allow error state to be set again after resetError if super throws again', () => {
      const renderErrorFn = vi.fn();
      const tagName = defineErrorBoundaryComponent({
        renderErrorImpl: renderErrorFn,
      });

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      // Put into error state
      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('persistent error');
      };

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      expect(el._hasError).toBe(true);
      renderErrorFn.mockClear();

      // Override super to throw again on reset
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('still broken');
      };

      try {
        el.resetError();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      // Should be back in error state
      expect(el._hasError).toBe(true);
      expect(el._error!.message).toBe('still broken');
      expect(renderErrorFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('_updateDynamicParts when not connected', () => {
    it('should return immediately if _isConnected is false', () => {
      const renderFn = vi.fn();
      const renderErrorFn = vi.fn();
      const tagName = defineErrorBoundaryComponent({
        renderImpl: renderFn,
        renderErrorImpl: renderErrorFn,
      });

      const el = document.createElement(tagName) as any;
      // Element is not connected (not appended to document)
      // The element has not been mounted, so renderFn won't have been called by mount
      renderFn.mockClear();
      renderErrorFn.mockClear();

      el._updateDynamicParts();

      expect(renderFn).not.toHaveBeenCalled();
      expect(renderErrorFn).not.toHaveBeenCalled();
    });

    it('should not call renderError when disconnected even if _hasError is true', () => {
      const renderErrorFn = vi.fn();
      const tagName = defineErrorBoundaryComponent({
        renderErrorImpl: renderErrorFn,
      });

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      // Put into error state
      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('error');
      };

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      expect(el._hasError).toBe(true);
      renderErrorFn.mockClear();

      // Disconnect
      document.body.removeChild(el);

      // Manually call _updateDynamicParts while disconnected
      el._updateDynamicParts();

      expect(renderErrorFn).not.toHaveBeenCalled();
    });
  });

  describe('_showDevOverlay', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      // Remove any overlays left behind
      document.querySelectorAll('div').forEach(el => {
        if (el.style.cssText.includes('position: fixed') || el.style.position === 'fixed') {
          el.remove();
        }
      });
    });

    it('should create a dev overlay when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';

      const tagName = defineErrorBoundaryComponent({});

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('dev overlay error');
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      // Check that an overlay was added to document.body
      // Look for an h2 with our error text
      const h2Elements = document.body.querySelectorAll('h2');
      let foundOverlay = false;
      for (const h2 of h2Elements) {
        if (h2.textContent?.includes('PolyX Error')) {
          foundOverlay = true;
          break;
        }
      }
      expect(foundOverlay).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should include error message and component tag name in the overlay', () => {
      process.env.NODE_ENV = 'development';

      const tagName = defineErrorBoundaryComponent({});

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('detailed error message');
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      // Find the overlay by looking for h2 with PolyX Error text
      const h2Elements = document.body.querySelectorAll('h2');
      let overlayParent: Element | null = null;
      for (const h2 of h2Elements) {
        if (h2.textContent?.includes('PolyX Error')) {
          overlayParent = h2.parentElement;
          break;
        }
      }

      expect(overlayParent).not.toBeNull();

      // Title should include the tag name
      const title = overlayParent!.querySelector('h2');
      expect(title?.textContent).toContain(tagName);

      // Message should be present in a pre element
      const pre = overlayParent!.querySelector('pre');
      expect(pre?.textContent).toContain('detailed error message');

      consoleSpy.mockRestore();
    });

    it('should have a close button that removes the overlay', () => {
      process.env.NODE_ENV = 'development';

      const tagName = defineErrorBoundaryComponent({});

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('closable error');
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      // Find the overlay
      const h2Elements = document.body.querySelectorAll('h2');
      let overlay: Element | null = null;
      for (const h2 of h2Elements) {
        if (h2.textContent?.includes('PolyX Error')) {
          overlay = h2.parentElement;
          break;
        }
      }

      expect(overlay).not.toBeNull();
      const closeBtn = overlay!.querySelector('button');
      expect(closeBtn).not.toBeNull();
      expect(closeBtn?.textContent).toBe('Close');

      // Click close button
      closeBtn?.click();

      // Overlay should be removed from the DOM
      expect(overlay!.parentNode).toBeNull();

      consoleSpy.mockRestore();
    });

    it('should NOT create a dev overlay when NODE_ENV is not development', () => {
      process.env.NODE_ENV = 'production';

      const tagName = defineErrorBoundaryComponent({});

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      const h2Before = document.body.querySelectorAll('h2').length;

      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('prod error');
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      const h2After = document.body.querySelectorAll('h2').length;

      // No new overlay should have been created
      expect(h2After).toBe(h2Before);

      consoleSpy.mockRestore();
    });

    it('should NOT create a dev overlay when NODE_ENV is undefined', () => {
      const saved = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      const tagName = defineErrorBoundaryComponent({});

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      const h2Before = document.body.querySelectorAll('h2').length;

      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('no env error');
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
        process.env.NODE_ENV = saved;
      }

      const h2After = document.body.querySelectorAll('h2').length;
      expect(h2After).toBe(h2Before);

      consoleSpy.mockRestore();
    });

    it('should display error stack in the overlay when available', () => {
      process.env.NODE_ENV = 'development';

      const tagName = defineErrorBoundaryComponent({});

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('stack trace error');
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      // Find the overlay
      const h2Elements = document.body.querySelectorAll('h2');
      let overlay: Element | null = null;
      for (const h2 of h2Elements) {
        if (h2.textContent?.includes('PolyX Error')) {
          overlay = h2.parentElement;
          break;
        }
      }

      expect(overlay).not.toBeNull();

      // The overlay should contain pre elements (message + stack)
      const preElements = overlay!.querySelectorAll('pre');
      expect(preElements.length).toBe(2); // message and stack

      consoleSpy.mockRestore();
    });

    it('should handle error without stack trace in the overlay', () => {
      process.env.NODE_ENV = 'development';

      const tagName = defineErrorBoundaryComponent({});

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      // Create an error with no stack
      const errorWithNoStack = new Error('no stack');
      errorWithNoStack.stack = undefined as any;

      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw errorWithNoStack;
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      // Find the overlay
      const h2Elements = document.body.querySelectorAll('h2');
      let overlay: Element | null = null;
      for (const h2 of h2Elements) {
        if (h2.textContent?.includes('PolyX Error')) {
          overlay = h2.parentElement;
          break;
        }
      }

      expect(overlay).not.toBeNull();

      // Stack pre should have empty text content
      const preElements = overlay!.querySelectorAll('pre');
      expect(preElements.length).toBe(2);
      // Second pre is the stack trace, should be empty string since stack is undefined
      expect(preElements[1].textContent).toBe('');

      consoleSpy.mockRestore();
    });

    it('should not create overlay if _error is null when _showDevOverlay is called', () => {
      process.env.NODE_ENV = 'development';

      const tagName = defineErrorBoundaryComponent({});

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      // _error is null (no error has occurred)
      expect(el._error).toBeNull();

      const h2Before = document.body.querySelectorAll('h2').length;

      // Call _showDevOverlay directly (it's private, use bracket notation)
      (el as any)._showDevOverlay();

      const h2After = document.body.querySelectorAll('h2').length;

      // No overlay should have been created because _error is null
      expect(h2After).toBe(h2Before);
    });
  });

  describe('error info structure', () => {
    it('should include componentName matching the element tag name (lowercase)', () => {
      const tagName = defineErrorBoundaryComponent({});

      const el = document.createElement(tagName) as any;
      document.body.appendChild(el);

      const originalSuper = PolyXElement.prototype._updateDynamicParts;
      PolyXElement.prototype._updateDynamicParts = function () {
        throw new Error('info test');
      };

      try {
        el._updateDynamicParts();
      } finally {
        PolyXElement.prototype._updateDynamicParts = originalSuper;
      }

      expect(el._errorInfo!.componentName).toBe(tagName);
      expect(el._errorInfo!.error).toBe(el._error);
    });
  });
});
