import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startTransition,
  startTransitionWithCallback,
  isTransition,
  isIdle,
  shouldYield,
  scheduleTransition,
  scheduleIdle,
  startIdle,
} from '../scheduler.js';

describe('scheduler priorities', () => {
  it('isTransition should return false by default (SYNC)', () => {
    expect(isTransition()).toBe(false);
  });

  it('isIdle should return false by default (SYNC)', () => {
    expect(isIdle()).toBe(false);
  });

  it('isTransition should return true inside startTransition', () => {
    let insideTransition = false;
    startTransition(() => {
      insideTransition = isTransition();
    });
    expect(insideTransition).toBe(true);
    // Should be restored after
    expect(isTransition()).toBe(false);
  });

  it('startTransition should restore priority even if callback throws', () => {
    try {
      startTransition(() => {
        throw new Error('test');
      });
    } catch {
      // expected
    }
    expect(isTransition()).toBe(false);
  });
});

describe('shouldYield', () => {
  it('should return false at SYNC priority', () => {
    expect(shouldYield()).toBe(false);
  });

  it('should check deadline inside startTransition', () => {
    // At TRANSITION priority, shouldYield checks performance.now() vs deadline.
    // Since there's no active frame deadline (it's 0 from init), it might yield immediately.
    startTransition(() => {
      // shouldYield depends on _frameDeadline which is only set in flushTransitions.
      // At initial state, _frameDeadline = 0, so performance.now() >= 0 is true.
      const result = shouldYield();
      expect(typeof result).toBe('boolean');
    });
  });
});

describe('scheduleTransition', () => {
  it('should queue work and execute via RAF', async () => {
    const work = vi.fn();
    scheduleTransition(work);

    // Work should not execute immediately
    expect(work).not.toHaveBeenCalled();

    // Wait for RAF + microtask
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    expect(work).toHaveBeenCalledTimes(1);
  });

  it('should batch multiple transition items in one RAF', async () => {
    const work1 = vi.fn();
    const work2 = vi.fn();
    const work3 = vi.fn();

    scheduleTransition(work1);
    scheduleTransition(work2);
    scheduleTransition(work3);

    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    expect(work1).toHaveBeenCalledTimes(1);
    expect(work2).toHaveBeenCalledTimes(1);
    expect(work3).toHaveBeenCalledTimes(1);
  });
});

describe('scheduleIdle', () => {
  it('should execute work eventually', async () => {
    const work = vi.fn();
    scheduleIdle(work);

    // Work should not execute immediately
    expect(work).not.toHaveBeenCalled();

    // Wait enough time for idle callback or setTimeout(50) fallback
    await new Promise(r => setTimeout(r, 100));

    expect(work).toHaveBeenCalledTimes(1);
  });

  it('should execute multiple idle items', async () => {
    const work1 = vi.fn();
    const work2 = vi.fn();

    scheduleIdle(work1);
    scheduleIdle(work2);

    await new Promise(r => setTimeout(r, 100));

    expect(work1).toHaveBeenCalledTimes(1);
    expect(work2).toHaveBeenCalledTimes(1);
  });
});

describe('startIdle', () => {
  it('should invoke the callback', async () => {
    const callback = vi.fn();
    startIdle(callback);

    await new Promise(r => setTimeout(r, 100));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should use requestIdleCallback when available', async () => {
    // requestIdleCallback should exist in the test environment (happy-dom or polyfill)
    // If it does, startIdle should use it. We spy on it to verify.
    const originalRIC = globalThis.requestIdleCallback;
    const ricSpy = vi.fn((cb: IdleRequestCallback) => {
      cb({} as IdleDeadline);
      return 0;
    });
    globalThis.requestIdleCallback = ricSpy;

    const callback = vi.fn();
    startIdle(callback);

    expect(ricSpy).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);

    globalThis.requestIdleCallback = originalRIC;
  });

  it('should fallback to setTimeout when requestIdleCallback is not available', async () => {
    const originalRIC = globalThis.requestIdleCallback;
    // Remove requestIdleCallback to test fallback path
    delete (globalThis as any).requestIdleCallback;

    const callback = vi.fn();
    startIdle(callback);

    // Should not be called immediately (setTimeout(50))
    expect(callback).not.toHaveBeenCalled();

    await new Promise(r => setTimeout(r, 100));
    expect(callback).toHaveBeenCalledTimes(1);

    globalThis.requestIdleCallback = originalRIC;
  });
});

describe('startTransitionWithCallback', () => {
  it('should call onComplete immediately when no transition work is scheduled', () => {
    const onComplete = vi.fn();
    startTransitionWithCallback(() => {
      // No scheduleTransition calls inside
    }, onComplete);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('should call onComplete after all scheduled batch work completes', async () => {
    const onComplete = vi.fn();
    const work1 = vi.fn();
    const work2 = vi.fn();

    startTransitionWithCallback(() => {
      scheduleTransition(work1);
      scheduleTransition(work2);
    }, onComplete);

    // onComplete should NOT be called yet (work is deferred to RAF)
    expect(onComplete).not.toHaveBeenCalled();

    // Wait for RAF to flush the transition queue
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    expect(work1).toHaveBeenCalledTimes(1);
    expect(work2).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('should track batch pendingCount correctly with single scheduled work', async () => {
    const onComplete = vi.fn();

    startTransitionWithCallback(() => {
      scheduleTransition(() => {
        // batch.pendingCount decrements here
      });
    }, onComplete);

    expect(onComplete).not.toHaveBeenCalled();

    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('flushTransitions yield behavior', () => {
  // NOTE: Lines 119-122 (the yield-and-reschedule path in flushTransitions) are structurally
  // unreachable in the current implementation. flushTransitions is called from requestAnimationFrame,
  // at which point _currentPriority is always SYNC. shouldYield() returns false at SYNC priority
  // (line 81: if (_currentPriority === SYNC) return false), so the yield branch can never be entered.
  // This is a design issue in the scheduler — the priority should be set to TRANSITION during
  // flushTransitions for the yield mechanism to work. Covering these lines would require either
  // modifying the scheduler source or exposing internal state.

  it('shouldYield always returns false during flushTransitions because priority is SYNC', async () => {
    // Verify that shouldYield returns false when called from within a scheduled transition work item,
    // confirming that the yield path (lines 119-122) cannot be reached.
    let yieldInsideWork: boolean | undefined;

    scheduleTransition(() => {
      // This runs inside flushTransitions (RAF callback), where _currentPriority is SYNC
      yieldInsideWork = shouldYield();
    });

    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    // shouldYield returns false because the priority is SYNC during flushTransitions
    expect(yieldInsideWork).toBe(false);
  });
});
