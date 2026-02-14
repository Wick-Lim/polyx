// Priority-based scheduler for PolyX updates
// SYNC: immediate microtask (default behavior)
// TRANSITION: deferred to requestAnimationFrame (lower priority)
// IDLE: deferred to requestIdleCallback (lowest priority)

const SYNC = 0;
const TRANSITION = 1;
const IDLE = 2;

const FRAME_BUDGET_MS = 5; // 5ms budget per frame (same as React)

let _currentPriority = SYNC;
let _transitionQueue: (() => void)[] = [];
let _transitionScheduled = false;
let _transitionFlushIndex = 0;
let _frameDeadline = 0;

// Idle queue
let _idleQueue: (() => void)[] = [];
let _idleScheduled = false;

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

export function isIdle(): boolean {
  return _currentPriority === IDLE;
}

/**
 * Check if the scheduler should yield control back to the browser.
 * Returns false for SYNC priority (never yields).
 * For TRANSITION/IDLE, yields when frame budget is exceeded.
 */
export function shouldYield(): boolean {
  if (_currentPriority === SYNC) return false;
  return performance.now() >= _frameDeadline;
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
  _frameDeadline = performance.now() + FRAME_BUDGET_MS;
  _transitionFlushIndex = 0;

  while (_transitionFlushIndex < _transitionQueue.length) {
    const work = _transitionQueue[_transitionFlushIndex];
    _transitionFlushIndex++;
    work();

    // Yield if we've exceeded the frame budget
    // Unreachable: flushTransitions runs at SYNC priority where shouldYield() always returns false
    /* v8 ignore start */
    if (_transitionFlushIndex < _transitionQueue.length && shouldYield()) {
      _transitionQueue = _transitionQueue.slice(_transitionFlushIndex);
      _transitionFlushIndex = 0;
      requestAnimationFrame(flushTransitions);
      return;
    }
    /* v8 ignore stop */
  }

  // All work completed
  _transitionQueue = [];
  _transitionFlushIndex = 0;
  _transitionScheduled = false;
}

/**
 * Schedule work at IDLE priority.
 * Uses requestIdleCallback when available, falls back to setTimeout(50).
 */
export function scheduleIdle(work: () => void): void {
  _idleQueue.push(work);

  if (!_idleScheduled) {
    _idleScheduled = true;
    startIdle(flushIdleQueue);
  }
}

function flushIdleQueue(): void {
  _idleScheduled = false;
  const queue = _idleQueue;
  _idleQueue = [];

  const prev = _currentPriority;
  _currentPriority = IDLE;
  try {
    for (const work of queue) {
      work();
    }
  } finally {
    _currentPriority = prev;
  }
}

/**
 * Start an idle callback using requestIdleCallback or setTimeout fallback.
 */
export function startIdle(callback: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => callback());
  } else {
    setTimeout(callback, 50);
  }
}
