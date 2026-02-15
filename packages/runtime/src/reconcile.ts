// Keyed reconciliation using Longest Increasing Subsequence (LIS) for minimal DOM moves

import { releaseNode } from './pool.js';

export interface KeyedItem {
  key: string | number;
  node: Node;
}

// Find LIS indices for move optimization — O(n log n) using patience sorting
function longestIncreasingSubsequence(arr: number[]): number[] {
  const n = arr.length;
  if (n === 0) return [];

  // tails[i] holds the index in arr of the smallest tail element for LIS of length i+1
  const tails: number[] = [];
  const prev: number[] = new Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    // Binary search for insertion point in tails
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[tails[mid]] < arr[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }

  // Backtrack to reconstruct LIS
  const result: number[] = [];
  let k = tails[tails.length - 1];
  for (let i = tails.length - 1; i >= 0; i--) {
    result.push(k);
    k = prev[k];
  }
  return result.reverse();
}

export function reconcileChildren(
  parentNode: Node,
  marker: Node, // Comment node marking the slot position
  oldItems: KeyedItem[],
  newItems: KeyedItem[]
): void {
  if (newItems.length === 0) {
    // Remove all old items and release to pool
    oldItems.forEach(item => {
      item.node.parentNode?.removeChild(item.node);
      releaseNode(item.node);
    });
    return;
  }

  if (oldItems.length === 0) {
    // Insert all new items
    const parent = marker.parentNode!;
    const fragment = document.createDocumentFragment();
    newItems.forEach(item => fragment.appendChild(item.node));
    parent.insertBefore(fragment, marker.nextSibling);
    return;
  }

  // Build old key → index map
  const oldKeyMap = new Map<string | number, number>();
  oldItems.forEach((item, i) => oldKeyMap.set(item.key, i));

  // Determine which old items to keep and their new positions
  const newKeySet = new Set(newItems.map(item => item.key));
  const toRemove: Node[] = [];

  // Remove old items not in new list
  oldItems.forEach(item => {
    if (!newKeySet.has(item.key)) {
      toRemove.push(item.node);
    }
  });
  toRemove.forEach(node => {
    node.parentNode?.removeChild(node);
    releaseNode(node);
  });

  // For each new item, record its old index (-1 if new)
  const oldIndices: number[] = newItems.map(item => {
    const idx = oldKeyMap.get(item.key);
    return idx !== undefined ? idx : -1;
  });

  // Build array of old indices for existing (non-new) items, preserving order in newItems
  // Also track which newItems index maps to which position in existingIndices
  const existingOldIndices: number[] = [];
  const existingNewIndices: number[] = [];
  for (let i = 0; i < oldIndices.length; i++) {
    if (oldIndices[i] !== -1) {
      existingOldIndices.push(oldIndices[i]);
      existingNewIndices.push(i);
    }
  }

  // Find LIS of old indices — these nodes are already in correct relative order
  const lisPositions = new Set(longestIncreasingSubsequence(existingOldIndices));
  const stableNewIndices = new Set<number>();
  lisPositions.forEach(pos => {
    stableNewIndices.add(existingNewIndices[pos]);
  });

  // Now place nodes: iterate newItems in order.
  // Nodes in the LIS stable set stay in place; others get inserted/moved.
  const parent = marker.parentNode!;

  // Walk through newItems in reverse so we always know the "next sibling" to insert before.
  // The reference node starts as the node after all list items (after marker's list region).
  // Find the boundary: the node right after the last old node in DOM order.
  const oldNodeSet = new Set(oldItems.map(item => item.node));
  let boundary: Node | null = marker.nextSibling;
  while (boundary && oldNodeSet.has(boundary)) {
    boundary = boundary.nextSibling;
  }

  // Process in reverse: last new item should be just before boundary
  let nextSibling: Node | null = boundary;
  for (let i = newItems.length - 1; i >= 0; i--) {
    const node = newItems[i].node;
    if (stableNewIndices.has(i)) {
      // Node is in stable set — it should already be in the DOM before nextSibling
      // Just update nextSibling reference
      nextSibling = node;
    } else {
      // Node needs to be moved/inserted before nextSibling
      parent.insertBefore(node, nextSibling);
      nextSibling = node;
    }
  }
}

// Non-keyed reconciliation — simple approach with value comparison
export function reconcileNonKeyed(
  parentNode: Node,
  marker: Node,
  oldNodes: Node[],
  newValues: any[],
  oldValues: any[],
  createElement: (value: any) => Node
): Node[] {
  const newNodes: Node[] = [];

  for (let i = 0; i < newValues.length; i++) {
    if (i < oldNodes.length) {
      // Skip if value unchanged (reference equality)
      if (i < oldValues.length && oldValues[i] === newValues[i]) {
        newNodes.push(oldNodes[i]);
        continue;
      }

      // Reuse existing node if same type
      const oldNode = oldNodes[i];
      const newNode = createElement(newValues[i]);

      if (oldNode.nodeType === Node.TEXT_NODE && newNode.nodeType === Node.TEXT_NODE) {
        if (oldNode.textContent !== newNode.textContent) {
          oldNode.textContent = newNode.textContent;
        }
        newNodes.push(oldNode);
      } else {
        oldNode.parentNode?.replaceChild(newNode, oldNode);
        releaseNode(oldNode);
        newNodes.push(newNode);
      }
    } else {
      // Add new node — insert after the last placed node (or after marker if first)
      const newNode = createElement(newValues[i]);
      const parent = marker.parentNode!;
      const insertRef = newNodes.length > 0
        ? newNodes[newNodes.length - 1].nextSibling
        : marker.nextSibling;
      parent.insertBefore(newNode, insertRef);
      newNodes.push(newNode);
    }
  }

  // Remove excess old nodes and release to pool
  for (let i = newValues.length; i < oldNodes.length; i++) {
    oldNodes[i].parentNode?.removeChild(oldNodes[i]);
    releaseNode(oldNodes[i]);
  }

  return newNodes;
}
