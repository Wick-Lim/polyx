// Priority-based scheduler for PolyX updates
// SYNC: immediate microtask (default behavior)
// TRANSITION: deferred to requestAnimationFrame (lower priority)

const SYNC = 0;
const TRANSITION = 1;

let _currentPriority = SYNC;
let _transitionQueue: (() => void)[] = [];
let _transitionScheduled = false;

// Transition batch tracking for useTransition
interface TransitionBatch {
  id: number;
  pendingCount: number;
  onComplete: (() => void) | null;
}

let _batchIdCounter = 0;
let _currentBatch: TransitionBatch | null = null;

export function startTransition(callback: () => void): void {
  const prev = _currentPriority;
  _currentPriority = TRANSITION;
  try {
    callback();
  } finally {
    _currentPriority = prev;
  }
}

export function startTransitionWithCallback(callback: () => void, onComplete: () => void): void {
  const batch: TransitionBatch = {
    id: ++_batchIdCounter,
    pendingCount: 0,
    onComplete,
  };

  const prevBatch = _currentBatch;
  _currentBatch = batch;

  const prev = _currentPriority;
  _currentPriority = TRANSITION;
  try {
    callback();
  } finally {
    _currentPriority = prev;
    _currentBatch = prevBatch;
  }

  // If no work was scheduled, complete immediately
  if (batch.pendingCount === 0) {
    onComplete();
  }
}

export function isTransition(): boolean {
  return _currentPriority === TRANSITION;
}

export function scheduleTransition(work: () => void): void {
  const batch = _currentBatch;

  if (batch) {
    batch.pendingCount++;
    _transitionQueue.push(() => {
      work();
      batch.pendingCount--;
      if (batch.pendingCount === 0 && batch.onComplete) {
        batch.onComplete();
      }
    });
  } else {
    _transitionQueue.push(work);
  }

  if (!_transitionScheduled) {
    _transitionScheduled = true;
    requestAnimationFrame(flushTransitions);
  }
}

function flushTransitions(): void {
  _transitionScheduled = false;
  const queue = _transitionQueue;
  _transitionQueue = [];
  for (const work of queue) work();
}
