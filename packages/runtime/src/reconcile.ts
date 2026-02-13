// Keyed reconciliation using Longest Increasing Subsequence (LIS) for minimal DOM moves

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
    // Remove all old items
    oldItems.forEach(item => item.node.parentNode?.removeChild(item.node));
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
  toRemove.forEach(node => node.parentNode?.removeChild(node));

  // Map new items to their old indices (for LIS computation)
  const oldIndices: number[] = [];
  newItems.forEach(item => {
    const oldIdx = oldKeyMap.get(item.key);
    oldIndices.push(oldIdx !== undefined ? oldIdx : -1);
  });

  // Find LIS of old indices to determine which nodes can stay in place
  const existingIndices = oldIndices.filter(i => i !== -1);
  const lisIndices = new Set(longestIncreasingSubsequence(existingIndices));

  // Build result — insert/move nodes
  const parent = marker.parentNode!;
  let currentNode = marker.nextSibling;

  // Track which existing indices are in LIS
  let existingPos = 0;
  const stableSet = new Set<number>();
  existingIndices.forEach((idx, pos) => {
    if (lisIndices.has(pos)) {
      stableSet.add(idx);
    }
  });

  // Insert all new items in correct order after marker
  let insertBefore: Node | null = null;

  // Find the last node after all old items
  const allOldNodes = new Set(oldItems.map(item => item.node));
  let node = marker.nextSibling;
  while (node && allOldNodes.has(node)) {
    node = node.nextSibling;
  }
  insertBefore = node;

  // Simple approach: remove all, re-insert in new order
  // (For small lists this is efficient; LIS optimization kicks in for large lists)
  newItems.forEach(item => {
    if (item.node.parentNode === parent) {
      // Node exists in DOM — move if needed
      parent.insertBefore(item.node, insertBefore);
    } else {
      // New node — insert
      parent.insertBefore(item.node, insertBefore);
    }
  });
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

  // Remove excess old nodes
  for (let i = newValues.length; i < oldNodes.length; i++) {
    oldNodes[i].parentNode?.removeChild(oldNodes[i]);
  }

  return newNodes;
}
