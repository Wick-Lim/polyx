import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPortal } from '../portal.js';
// PolyXPortal is auto-registered as 'polyx-portal' on import
import '../portal.js';

describe('createPortal', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'portal-target';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should return a Comment placeholder', () => {
    const content = document.createElement('div');
    const placeholder = createPortal(content, container);

    expect(placeholder).toBeInstanceOf(Comment);
    expect(placeholder.textContent).toBe('polyx-portal');
  });

  it('should append Node content to the container', () => {
    const content = document.createElement('span');
    content.textContent = 'Portal Content';

    createPortal(content, container);

    expect(container.querySelector('span')).not.toBeNull();
    expect(container.textContent).toContain('Portal Content');
  });

  it('should append string content as text node to the container', () => {
    createPortal('Hello Portal', container);

    expect(container.textContent).toContain('Hello Portal');
  });

  it('should render into a different container than the parent tree', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const content = document.createElement('div');
    content.className = 'modal';

    const placeholder = createPortal(content, container);
    parent.appendChild(placeholder);

    // Content should be in container, not in parent
    expect(container.querySelector('.modal')).not.toBeNull();
    expect(parent.querySelector('.modal')).toBeNull();

    document.body.removeChild(parent);
  });
});

describe('PolyXPortal custom element', () => {
  let targetContainer: HTMLElement;

  beforeEach(() => {
    targetContainer = document.createElement('div');
    targetContainer.id = 'modal-root';
    document.body.appendChild(targetContainer);
  });

  afterEach(() => {
    if (targetContainer.parentNode) {
      document.body.removeChild(targetContainer);
    }
  });

  it('should move children to target via property (Element)', async () => {
    const portal = document.createElement('polyx-portal') as any;
    portal.target = targetContainer;

    const child = document.createElement('div');
    child.className = 'modal-content';
    child.textContent = 'Modal!';
    portal.appendChild(child);

    document.body.appendChild(portal);

    // Wait for connected + mutation observer
    await new Promise(r => setTimeout(r, 10));

    // Child should have been moved to targetContainer
    const portalWrapper = targetContainer.querySelector('[data-polyx-portal]');
    expect(portalWrapper).not.toBeNull();
    expect(portalWrapper!.querySelector('.modal-content')).not.toBeNull();
    expect(portalWrapper!.textContent).toContain('Modal!');

    document.body.removeChild(portal);
  });

  it('should move children to target via CSS selector attribute', async () => {
    const portal = document.createElement('polyx-portal');
    portal.setAttribute('target', '#modal-root');

    const child = document.createElement('span');
    child.textContent = 'Selector Portal';
    portal.appendChild(child);

    document.body.appendChild(portal);

    await new Promise(r => setTimeout(r, 10));

    const portalWrapper = targetContainer.querySelector('[data-polyx-portal]');
    expect(portalWrapper).not.toBeNull();
    expect(portalWrapper!.textContent).toContain('Selector Portal');

    document.body.removeChild(portal);
  });

  it('should set display:contents on self', () => {
    const portal = document.createElement('polyx-portal') as any;
    portal.target = targetContainer;

    document.body.appendChild(portal);
    expect(portal.style.display).toBe('contents');

    document.body.removeChild(portal);
  });

  it('should clean up portal content on disconnect', async () => {
    const portal = document.createElement('polyx-portal') as any;
    portal.target = targetContainer;

    const child = document.createElement('div');
    child.textContent = 'Will be removed';
    portal.appendChild(child);

    document.body.appendChild(portal);

    await new Promise(r => setTimeout(r, 10));
    expect(targetContainer.querySelector('[data-polyx-portal]')).not.toBeNull();

    // Disconnect
    document.body.removeChild(portal);

    // Portal container should be removed from target
    expect(targetContainer.querySelector('[data-polyx-portal]')).toBeNull();
  });

  it('should handle portal with no target gracefully', async () => {
    const portal = document.createElement('polyx-portal');

    const child = document.createElement('div');
    child.textContent = 'No target';
    portal.appendChild(child);

    // Should not throw
    document.body.appendChild(portal);
    await new Promise(r => setTimeout(r, 10));

    document.body.removeChild(portal);
  });
});
