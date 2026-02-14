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

  it('should resolve target from CSS selector string via property setter', async () => {
    const portal = document.createElement('polyx-portal') as any;
    portal.target = '#modal-root';

    const child = document.createElement('div');
    child.className = 'selector-content';
    child.textContent = 'Selector Portal';
    portal.appendChild(child);

    document.body.appendChild(portal);

    await new Promise(r => setTimeout(r, 10));

    const portalWrapper = targetContainer.querySelector('[data-polyx-portal]');
    expect(portalWrapper).not.toBeNull();
    expect(portalWrapper!.textContent).toContain('Selector Portal');

    document.body.removeChild(portal);
  });

  it('should set target to null when null is passed via property setter', () => {
    const portal = document.createElement('polyx-portal') as any;
    portal.target = targetContainer;
    expect(portal.target).toBe(targetContainer);

    portal.target = null;
    // After setting null, the target getter should fallback to attribute
    // Since no attribute is set, it returns null
    expect(portal.target).toBeNull();
  });

  it('should call _moveChildren when target is set while connected', async () => {
    const portal = document.createElement('polyx-portal') as any;

    // Connect the portal without a target first
    document.body.appendChild(portal);

    await new Promise(r => setTimeout(r, 10));

    // No portal container should exist since there's no target
    expect(targetContainer.querySelector('[data-polyx-portal]')).toBeNull();

    // Add a child to the portal
    const child = document.createElement('div');
    child.className = 'late-target-content';
    child.textContent = 'Late target';
    portal.appendChild(child);

    await new Promise(r => setTimeout(r, 10));

    // Now set the target while connected — this should trigger _moveChildren (line 35)
    portal.target = targetContainer;

    await new Promise(r => setTimeout(r, 10));

    // The portal container should now be created in the target
    const portalWrapper = targetContainer.querySelector('[data-polyx-portal]');
    expect(portalWrapper).not.toBeNull();

    document.body.removeChild(portal);
  });

  it('should observe dynamically added children via MutationObserver', async () => {
    const portal = document.createElement('polyx-portal') as any;
    portal.target = targetContainer;

    document.body.appendChild(portal);

    await new Promise(r => setTimeout(r, 10));

    // Dynamically add a child after the portal is connected
    const dynamicChild = document.createElement('div');
    dynamicChild.className = 'dynamic-child';
    dynamicChild.textContent = 'Dynamic';
    portal.appendChild(dynamicChild);

    // Wait for MutationObserver to fire
    await new Promise(r => setTimeout(r, 50));

    const portalWrapper = targetContainer.querySelector('[data-polyx-portal]');
    expect(portalWrapper).not.toBeNull();
    expect(portalWrapper!.querySelector('.dynamic-child')).not.toBeNull();

    document.body.removeChild(portal);
  });

  it('should disconnect MutationObserver and clean up portal container on disconnect', async () => {
    const portal = document.createElement('polyx-portal') as any;
    portal.target = targetContainer;

    const child = document.createElement('div');
    child.textContent = 'Cleanup test';
    portal.appendChild(child);

    document.body.appendChild(portal);

    await new Promise(r => setTimeout(r, 10));

    // Verify portal container exists
    expect(targetContainer.querySelector('[data-polyx-portal]')).not.toBeNull();

    // Disconnect
    document.body.removeChild(portal);

    // Portal container should be removed
    expect(targetContainer.querySelector('[data-polyx-portal]')).toBeNull();

    // Re-appending should work again (observer was cleaned up)
    portal.target = targetContainer;
    document.body.appendChild(portal);
    await new Promise(r => setTimeout(r, 10));

    document.body.removeChild(portal);
  });

  it('should reconnect observer after moving children in _moveChildren', async () => {
    const portal = document.createElement('polyx-portal') as any;
    portal.target = targetContainer;

    document.body.appendChild(portal);

    await new Promise(r => setTimeout(r, 10));

    // Add child after portal is connected — observer should detect it
    const child1 = document.createElement('div');
    child1.className = 'child1';
    portal.appendChild(child1);

    await new Promise(r => setTimeout(r, 50));

    // child1 should have been moved
    const portalWrapper = targetContainer.querySelector('[data-polyx-portal]');
    expect(portalWrapper).not.toBeNull();
    expect(portalWrapper!.querySelector('.child1')).not.toBeNull();

    // Add another child — observer should still work (was reconnected)
    const child2 = document.createElement('div');
    child2.className = 'child2';
    portal.appendChild(child2);

    await new Promise(r => setTimeout(r, 50));

    expect(portalWrapper!.querySelector('.child2')).not.toBeNull();

    document.body.removeChild(portal);
  });

  it('target getter should return attribute when no property target is set', () => {
    const portal = document.createElement('polyx-portal') as any;
    portal.setAttribute('target', '#some-selector');

    // No property set, so getter returns the attribute value
    expect(portal.target).toBe('#some-selector');
  });
});
