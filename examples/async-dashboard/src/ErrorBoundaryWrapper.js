import { PolyXErrorBoundary } from '@polyx/runtime';

class ErrorBoundaryWrapperElement extends PolyXErrorBoundary {
  static template = PolyXErrorBoundary.createTemplate(
    '<div class="error-boundary-content"><span data-dyn="0"></span></div>'
  );

  renderError(error, info) {
    this.innerHTML = `
      <div style="background:#2d1b1b;border:2px solid #e74c3c;border-radius:8px;padding:1.5rem;margin:1rem 0;">
        <h3 style="color:#e74c3c;margin:0 0 0.5rem;">Something went wrong</h3>
        <p style="color:#ccc;margin:0 0 1rem;font-size:0.9rem;">${error.message}</p>
        <button onclick="this.closest('polyx-errorboundarywrapper').resetError()"
                style="background:#e74c3c;color:white;border:none;padding:0.5rem 1rem;border-radius:6px;cursor:pointer;">
          Retry
        </button>
      </div>
    `;
  }

  _render() {
    const children = this._props.children;
    this._setDynamicValue(0, children);
  }
}

customElements.define('polyx-errorboundarywrapper', ErrorBoundaryWrapperElement);

export default ErrorBoundaryWrapperElement;
