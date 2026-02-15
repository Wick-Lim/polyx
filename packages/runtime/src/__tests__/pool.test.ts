import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  enableDOMRecycling,
  disableDOMRecycling,
  acquireNode,
  releaseNode,
  clearPool,
  isPoolEnabled,
  getPoolSize,
  getPoolSizeFor,
} from '../pool.js';

afterEach(() => {
  disableDOMRecycling();
});

describe('enableDOMRecycling / disableDOMRecycling', () => {
  it('enables the pool', () => {
    enableDOMRecycling();
    expect(isPoolEnabled()).toBe(true);
  });

  it('disables the pool and clears it', () => {
    enableDOMRecycling();
    const div = document.createElement('div');
    releaseNode(div);
    expect(getPoolSize()).toBe(1);

    disableDOMRecycling();
    expect(isPoolEnabled()).toBe(false);
    expect(getPoolSize()).toBe(0);
  });

  it('isPoolEnabled reflects state', () => {
    expect(isPoolEnabled()).toBe(false);
    enableDOMRecycling();
    expect(isPoolEnabled()).toBe(true);
    disableDOMRecycling();
    expect(isPoolEnabled()).toBe(false);
  });
});

describe('acquireNode / releaseNode', () => {
  beforeEach(() => {
    enableDOMRecycling();
  });

  it('returns null when pool disabled', () => {
    disableDOMRecycling();
    expect(acquireNode('div')).toBeNull();
  });

  it('returns null for empty pool', () => {
    expect(acquireNode('div')).toBeNull();
  });

  it('release then acquire returns the same node', () => {
    const div = document.createElement('div');
    releaseNode(div);
    const acquired = acquireNode('div');
    expect(acquired).toBe(div);
  });

  it('released node has attributes cleaned', () => {
    const div = document.createElement('div');
    div.setAttribute('id', 'test');
    div.setAttribute('class', 'foo bar');
    div.setAttribute('data-dyn', '0');
    div.setAttribute('data-px-el', '1');
    releaseNode(div);

    expect(div.hasAttribute('id')).toBe(false);
    expect(div.hasAttribute('class')).toBe(false);
    expect(div.hasAttribute('data-dyn')).toBe(false);
    expect(div.hasAttribute('data-px-el')).toBe(false);
    expect(div.attributes.length).toBe(0);
  });

  it('released node has innerHTML cleared', () => {
    const div = document.createElement('div');
    div.innerHTML = '<span>child</span><p>another</p>';
    releaseNode(div);

    expect(div.innerHTML).toBe('');
    expect(div.childNodes.length).toBe(0);
  });

  it('released node has __polyx_* properties removed', () => {
    const div = document.createElement('div');
    (div as any).__polyx_handler = () => {};
    (div as any).__polyx_ref = { current: null };
    (div as any).__polyx_key = 'abc';
    releaseNode(div);

    expect((div as any).__polyx_handler).toBeUndefined();
    expect((div as any).__polyx_ref).toBeUndefined();
    expect((div as any).__polyx_key).toBeUndefined();
  });

  it('released non-HTMLElement nodes are ignored', () => {
    const textNode = document.createTextNode('hello');
    releaseNode(textNode);
    expect(getPoolSize()).toBe(0);

    const comment = document.createComment('comment');
    releaseNode(comment);
    expect(getPoolSize()).toBe(0);
  });

  it('acquires correct tag from pool', () => {
    const span = document.createElement('span');
    releaseNode(span);

    const acquired = acquireNode('span');
    expect(acquired).toBe(span);
    expect((acquired as HTMLElement).tagName.toLowerCase()).toBe('span');
  });

  it('does not mix different tag names', () => {
    const div = document.createElement('div');
    const span = document.createElement('span');
    releaseNode(div);
    releaseNode(span);

    const acquiredSpan = acquireNode('span');
    expect(acquiredSpan).toBe(span);

    const acquiredDiv = acquireNode('div');
    expect(acquiredDiv).toBe(div);

    // No cross-contamination
    expect(acquireNode('span')).toBeNull();
    expect(acquireNode('div')).toBeNull();
  });
});

describe('Pool limits', () => {
  it('respects maxPerTag limit', () => {
    enableDOMRecycling(2);

    releaseNode(document.createElement('div'));
    releaseNode(document.createElement('div'));
    releaseNode(document.createElement('div')); // should be ignored

    expect(getPoolSizeFor('div')).toBe(2);
    expect(getPoolSize()).toBe(2);
  });

  it('different tags have separate pools', () => {
    enableDOMRecycling(2);

    releaseNode(document.createElement('div'));
    releaseNode(document.createElement('div'));
    releaseNode(document.createElement('span'));

    expect(getPoolSizeFor('div')).toBe(2);
    expect(getPoolSizeFor('span')).toBe(1);
    expect(getPoolSize()).toBe(3);
  });
});

describe('clearPool', () => {
  it('clears all pooled nodes', () => {
    enableDOMRecycling();

    releaseNode(document.createElement('div'));
    releaseNode(document.createElement('span'));
    releaseNode(document.createElement('p'));
    expect(getPoolSize()).toBe(3);

    clearPool();
    expect(getPoolSize()).toBe(0);
    expect(getPoolSizeFor('div')).toBe(0);
    expect(getPoolSizeFor('span')).toBe(0);
    expect(getPoolSizeFor('p')).toBe(0);
  });
});

describe('getPoolSize / getPoolSizeFor', () => {
  it('returns 0 when disabled', () => {
    expect(getPoolSize()).toBe(0);
    expect(getPoolSizeFor('div')).toBe(0);
  });

  it('returns correct counts', () => {
    enableDOMRecycling();

    expect(getPoolSize()).toBe(0);
    expect(getPoolSizeFor('div')).toBe(0);

    releaseNode(document.createElement('div'));
    expect(getPoolSize()).toBe(1);
    expect(getPoolSizeFor('div')).toBe(1);

    releaseNode(document.createElement('div'));
    expect(getPoolSize()).toBe(2);
    expect(getPoolSizeFor('div')).toBe(2);

    releaseNode(document.createElement('span'));
    expect(getPoolSize()).toBe(3);
    expect(getPoolSizeFor('div')).toBe(2);
    expect(getPoolSizeFor('span')).toBe(1);

    // Acquiring reduces pool size
    acquireNode('div');
    expect(getPoolSize()).toBe(2);
    expect(getPoolSizeFor('div')).toBe(1);
  });
});

describe('PolyX element internals reset', () => {
  beforeEach(() => {
    enableDOMRecycling();
  });

  it('released node with _state property gets reset', () => {
    const el = document.createElement('div');

    // Simulate PolyX element internals
    (el as any)._state = { count: 5, name: 'test' };
    (el as any)._props = { title: 'Hello' };
    (el as any)._hasMounted = true;
    (el as any)._isConnected = true;
    (el as any)._pendingUpdate = true;
    (el as any)._valueMarkers = [document.createComment('m0')];
    (el as any)._valueCache = ['cached'];
    (el as any)._elements = [document.createElement('span')];
    (el as any)._instance = {
      hooks: [{ type: 'state', value: 5 }],
      hookIndex: 3,
      effects: [() => {}],
      layoutEffects: [() => {}],
    };

    releaseNode(el);

    // Verify all internals are reset
    expect((el as any)._state).toEqual({});
    expect((el as any)._props).toEqual({});
    expect((el as any)._hasMounted).toBe(false);
    expect((el as any)._isConnected).toBe(false);
    expect((el as any)._pendingUpdate).toBe(false);
    expect((el as any)._valueMarkers).toEqual([]);
    expect((el as any)._valueCache).toEqual([]);
    expect((el as any)._elements).toEqual([]);

    // Verify instance internals are reset
    expect((el as any)._instance.hooks).toEqual([]);
    expect((el as any)._instance.hookIndex).toBe(0);
    expect((el as any)._instance.effects).toEqual([]);
    expect((el as any)._instance.layoutEffects).toEqual([]);
  });
});
