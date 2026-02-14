import { describe, it, expect, vi } from 'vitest';
import { reconcileChildren, reconcileNonKeyed } from '../reconcile.js';
import type { KeyedItem } from '../reconcile.js';

// Helper: create a container with a marker comment node
function createContainer(): { parent: HTMLElement; marker: Comment } {
  const parent = document.createElement('div');
  const marker = document.createComment('marker');
  parent.appendChild(marker);
  return { parent, marker };
}

// Helper: create a text node
function textNode(text: string): Text {
  return document.createTextNode(text);
}

// Helper: create an element node
function elementNode(tag: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  return el;
}

// Helper: simple createElement for non-keyed reconciliation
function createElementFromValue(value: any): Node {
  if (typeof value === 'string' || typeof value === 'number') {
    return document.createTextNode(String(value));
  }
  const el = document.createElement('span');
  el.textContent = String(value);
  return el;
}

describe('reconcileNonKeyed', () => {
  it('should return empty array when both old and new are empty', () => {
    const { parent, marker } = createContainer();
    const result = reconcileNonKeyed(parent, marker, [], [], [], createElementFromValue);
    expect(result).toEqual([]);
  });

  it('should insert new items after marker when old is empty', () => {
    const { parent, marker } = createContainer();
    const result = reconcileNonKeyed(
      parent, marker, [], ['hello', 'world'], [], createElementFromValue
    );
    expect(result).toHaveLength(2);
    expect(result[0].textContent).toBe('hello');
    expect(result[1].textContent).toBe('world');
    // Nodes should be in the DOM after the marker
    expect(parent.childNodes[1]).toBe(result[0]);
    expect(parent.childNodes[2]).toBe(result[1]);
  });

  it('should remove all old nodes when new is empty', () => {
    const { parent, marker } = createContainer();
    const old1 = textNode('a');
    const old2 = textNode('b');
    parent.appendChild(old1);
    parent.appendChild(old2);

    const result = reconcileNonKeyed(
      parent, marker, [old1, old2], [], ['a', 'b'], createElementFromValue
    );
    expect(result).toEqual([]);
    // Old nodes should be removed from the DOM
    expect(parent.contains(old1)).toBe(false);
    expect(parent.contains(old2)).toBe(false);
  });

  it('should skip and reuse old nodes when values are reference-equal', () => {
    const { parent, marker } = createContainer();
    const old1 = textNode('a');
    const old2 = textNode('b');
    parent.appendChild(old1);
    parent.appendChild(old2);

    const valueA = 'a';
    const valueB = 'b';
    const oldValues = [valueA, valueB];
    const newValues = [valueA, valueB]; // same references

    const createElement = vi.fn(createElementFromValue);
    const result = reconcileNonKeyed(
      parent, marker, [old1, old2], newValues, oldValues, createElement
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(old1);
    expect(result[1]).toBe(old2);
    // createElement should NOT have been called (values skipped)
    expect(createElement).not.toHaveBeenCalled();
  });

  it('should update textContent in-place when both old and new are text nodes with different text', () => {
    const { parent, marker } = createContainer();
    const old1 = textNode('old text');
    parent.appendChild(old1);

    const result = reconcileNonKeyed(
      parent, marker, [old1], ['new text'], ['old text'], createElementFromValue
    );

    expect(result).toHaveLength(1);
    // Should reuse the same node (not create a new one)
    expect(result[0]).toBe(old1);
    // Text content should be updated
    expect(old1.textContent).toBe('new text');
  });

  it('should NOT update textContent when both are text nodes with same textContent', () => {
    const { parent, marker } = createContainer();
    const old1 = textNode('same');
    parent.appendChild(old1);

    // Old value is different reference (not reference-equal), but same textContent
    const oldValues = ['different-ref'];
    const newValues = ['same'];

    // Custom createElement that returns text node with same content
    const createElement = (value: any) => document.createTextNode(String(value));

    const result = reconcileNonKeyed(
      parent, marker, [old1], newValues, oldValues, createElement
    );

    expect(result).toHaveLength(1);
    // Should still reuse the old node
    expect(result[0]).toBe(old1);
    expect(old1.textContent).toBe('same');
  });

  it('should replace node when old and new have different node types', () => {
    const { parent, marker } = createContainer();
    const oldEl = elementNode('div', 'old');
    parent.appendChild(oldEl);

    // createElement returns a text node (different type from element)
    const createElement = (_value: any) => document.createTextNode('replaced');

    const result = reconcileNonKeyed(
      parent, marker, [oldEl], ['replaced'], ['old'], createElement
    );

    expect(result).toHaveLength(1);
    // Should NOT be the old element
    expect(result[0]).not.toBe(oldEl);
    expect(result[0].textContent).toBe('replaced');
    // Old element should be removed from DOM
    expect(parent.contains(oldEl)).toBe(false);
    // New node should be in DOM
    expect(parent.contains(result[0])).toBe(true);
  });

  it('should insert additional nodes when new list is longer than old list', () => {
    const { parent, marker } = createContainer();
    const old1 = textNode('a');
    parent.appendChild(old1);

    const val = 'a';
    const result = reconcileNonKeyed(
      parent, marker, [old1], [val, 'b', 'c'], [val], createElementFromValue
    );

    expect(result).toHaveLength(3);
    // First node reused (reference-equal value)
    expect(result[0]).toBe(old1);
    // New nodes inserted
    expect(result[1].textContent).toBe('b');
    expect(result[2].textContent).toBe('c');
    // All nodes in DOM
    expect(parent.contains(result[1])).toBe(true);
    expect(parent.contains(result[2])).toBe(true);
  });

  it('should remove excess old nodes when new list is shorter than old list', () => {
    const { parent, marker } = createContainer();
    const old1 = textNode('a');
    const old2 = textNode('b');
    const old3 = textNode('c');
    parent.appendChild(old1);
    parent.appendChild(old2);
    parent.appendChild(old3);

    const val = 'a';
    const result = reconcileNonKeyed(
      parent, marker, [old1, old2, old3], [val], [val, 'b', 'c'], createElementFromValue
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(old1);
    // Excess nodes removed
    expect(parent.contains(old2)).toBe(false);
    expect(parent.contains(old3)).toBe(false);
  });

  it('should use marker.nextSibling for first insertion when newNodes is empty (no previous nodes yet)', () => {
    const { parent, marker } = createContainer();
    // Add a trailing node after the marker
    const trailing = textNode('trailing');
    parent.appendChild(trailing);

    const result = reconcileNonKeyed(
      parent, marker, [], ['first'], [], createElementFromValue
    );

    expect(result).toHaveLength(1);
    expect(result[0].textContent).toBe('first');
    // Inserted between marker and trailing
    expect(parent.childNodes[0]).toBe(marker);
    expect(parent.childNodes[1]).toBe(result[0]);
    expect(parent.childNodes[2]).toBe(trailing);
  });

  it('should use last newNode nextSibling when inserting after existing newNodes', () => {
    const { parent, marker } = createContainer();
    const trailing = textNode('trailing');
    parent.appendChild(trailing);

    // Old has one node (value unchanged), then we add two more
    const old1 = textNode('a');
    // Insert old1 between marker and trailing
    parent.insertBefore(old1, trailing);

    const val = 'a';
    const result = reconcileNonKeyed(
      parent, marker, [old1], [val, 'b', 'c'], [val], createElementFromValue
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(old1);
    expect(result[1].textContent).toBe('b');
    expect(result[2].textContent).toBe('c');
    // Check DOM order: marker, old1, b, c, trailing
    const nodes = Array.from(parent.childNodes);
    expect(nodes.indexOf(marker)).toBeLessThan(nodes.indexOf(old1));
    expect(nodes.indexOf(old1)).toBeLessThan(nodes.indexOf(result[1]));
    expect(nodes.indexOf(result[1])).toBeLessThan(nodes.indexOf(result[2]));
    expect(nodes.indexOf(result[2])).toBeLessThan(nodes.indexOf(trailing));
  });

  it('should handle replacing element node with element node (same nodeType, not text)', () => {
    const { parent, marker } = createContainer();
    const oldEl = elementNode('div', 'old');
    parent.appendChild(oldEl);

    const createElement = (_value: any) => elementNode('span', 'new');

    const result = reconcileNonKeyed(
      parent, marker, [oldEl], ['new'], ['old'], createElement
    );

    expect(result).toHaveLength(1);
    // Both are element nodes, but old has different textContent so createElement is called.
    // Since both are ELEMENT_NODE (not TEXT_NODE), replaceChild is used.
    expect(result[0]).not.toBe(oldEl);
    expect(result[0].textContent).toBe('new');
    expect(parent.contains(result[0])).toBe(true);
    expect(parent.contains(oldEl)).toBe(false);
  });
});

describe('reconcileChildren (keyed)', () => {
  it('should remove all old items when newItems is empty', () => {
    const { parent, marker } = createContainer();
    const node1 = elementNode('div', 'a');
    const node2 = elementNode('div', 'b');
    parent.appendChild(node1);
    parent.appendChild(node2);

    const oldItems: KeyedItem[] = [
      { key: 1, node: node1 },
      { key: 2, node: node2 },
    ];

    reconcileChildren(parent, marker, oldItems, []);

    expect(parent.contains(node1)).toBe(false);
    expect(parent.contains(node2)).toBe(false);
    // Only the marker remains
    expect(parent.childNodes.length).toBe(1);
    expect(parent.childNodes[0]).toBe(marker);
  });

  it('should insert all new items when oldItems is empty', () => {
    const { parent, marker } = createContainer();
    const node1 = elementNode('div', 'a');
    const node2 = elementNode('div', 'b');

    const newItems: KeyedItem[] = [
      { key: 1, node: node1 },
      { key: 2, node: node2 },
    ];

    reconcileChildren(parent, marker, [], newItems);

    expect(parent.contains(node1)).toBe(true);
    expect(parent.contains(node2)).toBe(true);
    // Nodes should be after the marker
    const nodes = Array.from(parent.childNodes);
    expect(nodes.indexOf(marker)).toBeLessThan(nodes.indexOf(node1));
    expect(nodes.indexOf(node1)).toBeLessThan(nodes.indexOf(node2));
  });

  it('should reuse existing nodes and remove stale ones', () => {
    const { parent, marker } = createContainer();
    const nodeA = elementNode('div', 'A');
    const nodeB = elementNode('div', 'B');
    const nodeC = elementNode('div', 'C');
    parent.appendChild(nodeA);
    parent.appendChild(nodeB);
    parent.appendChild(nodeC);

    const oldItems: KeyedItem[] = [
      { key: 'a', node: nodeA },
      { key: 'b', node: nodeB },
      { key: 'c', node: nodeC },
    ];

    // Remove 'b', keep 'a' and 'c', add 'd'
    const nodeD = elementNode('div', 'D');
    const newItems: KeyedItem[] = [
      { key: 'a', node: nodeA },
      { key: 'c', node: nodeC },
      { key: 'd', node: nodeD },
    ];

    reconcileChildren(parent, marker, oldItems, newItems);

    // 'b' should be removed
    expect(parent.contains(nodeB)).toBe(false);
    // 'a', 'c', 'd' should be present
    expect(parent.contains(nodeA)).toBe(true);
    expect(parent.contains(nodeC)).toBe(true);
    expect(parent.contains(nodeD)).toBe(true);

    // Check correct order: marker, a, c, d
    const childNodes = Array.from(parent.childNodes);
    const idxMarker = childNodes.indexOf(marker);
    const idxA = childNodes.indexOf(nodeA);
    const idxC = childNodes.indexOf(nodeC);
    const idxD = childNodes.indexOf(nodeD);
    expect(idxMarker).toBeLessThan(idxA);
    expect(idxA).toBeLessThan(idxC);
    expect(idxC).toBeLessThan(idxD);
  });

  it('should reorder items with minimal DOM moves via LIS', () => {
    const { parent, marker } = createContainer();
    const nodeA = elementNode('div', 'A');
    const nodeB = elementNode('div', 'B');
    const nodeC = elementNode('div', 'C');
    const nodeD = elementNode('div', 'D');
    parent.appendChild(nodeA);
    parent.appendChild(nodeB);
    parent.appendChild(nodeC);
    parent.appendChild(nodeD);

    const oldItems: KeyedItem[] = [
      { key: 1, node: nodeA },
      { key: 2, node: nodeB },
      { key: 3, node: nodeC },
      { key: 4, node: nodeD },
    ];

    // Reverse the order
    const newItems: KeyedItem[] = [
      { key: 4, node: nodeD },
      { key: 3, node: nodeC },
      { key: 2, node: nodeB },
      { key: 1, node: nodeA },
    ];

    reconcileChildren(parent, marker, oldItems, newItems);

    // Check the DOM order matches newItems
    const childNodes = Array.from(parent.childNodes);
    const idxD = childNodes.indexOf(nodeD);
    const idxC = childNodes.indexOf(nodeC);
    const idxB = childNodes.indexOf(nodeB);
    const idxA = childNodes.indexOf(nodeA);
    expect(idxD).toBeLessThan(idxC);
    expect(idxC).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxA);
  });

  it('should handle all new items (no overlap with old)', () => {
    const { parent, marker } = createContainer();
    const oldNode1 = elementNode('div', 'old1');
    const oldNode2 = elementNode('div', 'old2');
    parent.appendChild(oldNode1);
    parent.appendChild(oldNode2);

    const oldItems: KeyedItem[] = [
      { key: 'x', node: oldNode1 },
      { key: 'y', node: oldNode2 },
    ];

    const newNode1 = elementNode('div', 'new1');
    const newNode2 = elementNode('div', 'new2');
    const newNode3 = elementNode('div', 'new3');
    const newItems: KeyedItem[] = [
      { key: 'a', node: newNode1 },
      { key: 'b', node: newNode2 },
      { key: 'c', node: newNode3 },
    ];

    reconcileChildren(parent, marker, oldItems, newItems);

    // Old nodes should be removed
    expect(parent.contains(oldNode1)).toBe(false);
    expect(parent.contains(oldNode2)).toBe(false);
    // New nodes should be present in order
    expect(parent.contains(newNode1)).toBe(true);
    expect(parent.contains(newNode2)).toBe(true);
    expect(parent.contains(newNode3)).toBe(true);

    const childNodes = Array.from(parent.childNodes);
    expect(childNodes.indexOf(newNode1)).toBeLessThan(childNodes.indexOf(newNode2));
    expect(childNodes.indexOf(newNode2)).toBeLessThan(childNodes.indexOf(newNode3));
  });

  it('should handle a single item correctly', () => {
    const { parent, marker } = createContainer();
    const node1 = elementNode('div', 'only');

    const newItems: KeyedItem[] = [{ key: 'solo', node: node1 }];

    reconcileChildren(parent, marker, [], newItems);

    expect(parent.contains(node1)).toBe(true);
    const childNodes = Array.from(parent.childNodes);
    expect(childNodes[0]).toBe(marker);
    expect(childNodes[1]).toBe(node1);
  });

  it('should handle swap of two items', () => {
    const { parent, marker } = createContainer();
    const nodeA = elementNode('div', 'A');
    const nodeB = elementNode('div', 'B');
    parent.appendChild(nodeA);
    parent.appendChild(nodeB);

    const oldItems: KeyedItem[] = [
      { key: 1, node: nodeA },
      { key: 2, node: nodeB },
    ];

    const newItems: KeyedItem[] = [
      { key: 2, node: nodeB },
      { key: 1, node: nodeA },
    ];

    reconcileChildren(parent, marker, oldItems, newItems);

    const childNodes = Array.from(parent.childNodes);
    expect(childNodes.indexOf(nodeB)).toBeLessThan(childNodes.indexOf(nodeA));
  });

  it('should handle insertion at the beginning', () => {
    const { parent, marker } = createContainer();
    const nodeA = elementNode('div', 'A');
    parent.appendChild(nodeA);

    const oldItems: KeyedItem[] = [{ key: 'a', node: nodeA }];

    const nodeNew = elementNode('div', 'New');
    const newItems: KeyedItem[] = [
      { key: 'new', node: nodeNew },
      { key: 'a', node: nodeA },
    ];

    reconcileChildren(parent, marker, oldItems, newItems);

    const childNodes = Array.from(parent.childNodes);
    expect(childNodes.indexOf(nodeNew)).toBeLessThan(childNodes.indexOf(nodeA));
    expect(parent.contains(nodeNew)).toBe(true);
  });

  it('should handle insertion at the end', () => {
    const { parent, marker } = createContainer();
    const nodeA = elementNode('div', 'A');
    parent.appendChild(nodeA);

    const oldItems: KeyedItem[] = [{ key: 'a', node: nodeA }];

    const nodeNew = elementNode('div', 'New');
    const newItems: KeyedItem[] = [
      { key: 'a', node: nodeA },
      { key: 'new', node: nodeNew },
    ];

    reconcileChildren(parent, marker, oldItems, newItems);

    const childNodes = Array.from(parent.childNodes);
    expect(childNodes.indexOf(nodeA)).toBeLessThan(childNodes.indexOf(nodeNew));
    expect(parent.contains(nodeNew)).toBe(true);
  });

  it('should handle boundary detection when old nodes follow marker', () => {
    const { parent, marker } = createContainer();
    const nodeA = elementNode('div', 'A');
    const nodeB = elementNode('div', 'B');
    const trailing = elementNode('div', 'trailing');
    parent.appendChild(nodeA);
    parent.appendChild(nodeB);
    parent.appendChild(trailing);

    const oldItems: KeyedItem[] = [
      { key: 1, node: nodeA },
      { key: 2, node: nodeB },
    ];

    // Keep same order
    const newItems: KeyedItem[] = [
      { key: 1, node: nodeA },
      { key: 2, node: nodeB },
    ];

    reconcileChildren(parent, marker, oldItems, newItems);

    // Trailing node should still be after all list nodes
    const childNodes = Array.from(parent.childNodes);
    expect(childNodes.indexOf(nodeB)).toBeLessThan(childNodes.indexOf(trailing));
    expect(parent.contains(trailing)).toBe(true);
  });

  it('should handle complex reorder with partial overlap', () => {
    const { parent, marker } = createContainer();
    const node1 = elementNode('div', '1');
    const node2 = elementNode('div', '2');
    const node3 = elementNode('div', '3');
    const node4 = elementNode('div', '4');
    const node5 = elementNode('div', '5');
    parent.appendChild(node1);
    parent.appendChild(node2);
    parent.appendChild(node3);
    parent.appendChild(node4);
    parent.appendChild(node5);

    const oldItems: KeyedItem[] = [
      { key: 1, node: node1 },
      { key: 2, node: node2 },
      { key: 3, node: node3 },
      { key: 4, node: node4 },
      { key: 5, node: node5 },
    ];

    // Remove 2 and 4, reorder to 5, 1, 3
    const newItems: KeyedItem[] = [
      { key: 5, node: node5 },
      { key: 1, node: node1 },
      { key: 3, node: node3 },
    ];

    reconcileChildren(parent, marker, oldItems, newItems);

    expect(parent.contains(node2)).toBe(false);
    expect(parent.contains(node4)).toBe(false);

    const childNodes = Array.from(parent.childNodes);
    expect(childNodes.indexOf(node5)).toBeLessThan(childNodes.indexOf(node1));
    expect(childNodes.indexOf(node1)).toBeLessThan(childNodes.indexOf(node3));
  });
});
