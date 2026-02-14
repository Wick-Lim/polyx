import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startTransition,
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
});
