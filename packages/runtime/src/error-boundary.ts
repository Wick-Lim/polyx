// Error Boundary support for PolyX components
import { PolyXElement } from './component.js';

export interface ErrorInfo {
  componentName: string;
  error: Error;
}

export abstract class PolyXErrorBoundary extends PolyXElement {
  protected _hasError = false;
  protected _error: Error | null = null;
  protected _errorInfo: ErrorInfo | null = null;

  // Override to provide fallback UI
  abstract renderError(error: Error, info: ErrorInfo): void;

  protected _updateDynamicParts() {
    if (!this._isConnected) return;

    if (this._hasError) {
      this.renderError(this._error!, this._errorInfo!);
      return;
    }

    try {
      super._updateDynamicParts();
    } catch (error) {
      this._hasError = true;
      this._error = error instanceof Error ? error : new Error(String(error));
      this._errorInfo = {
        componentName: this.tagName.toLowerCase(),
        error: this._error,
      };

      console.error(`[PolyX Error Boundary] Error in ${this.tagName}:`, this._error);

      // Show error UI
      this.renderError(this._error, this._errorInfo);

      // In dev mode, show overlay
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        this._showDevOverlay();
      }
    }
  }

  // Reset error state (call to retry rendering)
  resetError() {
    this._hasError = false;
    this._error = null;
    this._errorInfo = null;
    this._updateDynamicParts();
  }

  private _showDevOverlay() {
    if (!this._error) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.85); color: #ff6b6b; padding: 32px;
      font-family: monospace; font-size: 14px; z-index: 99999;
      overflow: auto; white-space: pre-wrap;
    `;

    const title = document.createElement('h2');
    title.textContent = `PolyX Error in <${this.tagName.toLowerCase()}>`;
    title.style.color = '#ff6b6b';

    const message = document.createElement('pre');
    message.textContent = this._error.message;
    message.style.color = '#ffd93d';

    const stack = document.createElement('pre');
    stack.textContent = this._error.stack || '';
    stack.style.cssText = 'color: #aaa; font-size: 12px; margin-top: 16px;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
      position: fixed; top: 16px; right: 16px; padding: 8px 16px;
      background: #ff6b6b; color: white; border: none; cursor: pointer;
      border-radius: 4px; font-size: 14px;
    `;
    closeBtn.onclick = () => overlay.remove();

    overlay.appendChild(closeBtn);
    overlay.appendChild(title);
    overlay.appendChild(message);
    overlay.appendChild(stack);
    document.body.appendChild(overlay);
  }
}
