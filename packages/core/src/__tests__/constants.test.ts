import { describe, it, expect } from 'vitest';
import { POLYX_TAG_PREFIX, HOOK_TYPES, JSX_PRAGMA } from '../constants.js';

describe('constants', () => {
  it('POLYX_TAG_PREFIX should be polyx-', () => {
    expect(POLYX_TAG_PREFIX).toBe('polyx-');
  });

  it('HOOK_TYPES should have all hook types', () => {
    expect(HOOK_TYPES.STATE).toBe('state');
    expect(HOOK_TYPES.EFFECT).toBe('effect');
    expect(HOOK_TYPES.LAYOUT_EFFECT).toBe('layout_effect');
    expect(HOOK_TYPES.MEMO).toBe('memo');
    expect(HOOK_TYPES.CALLBACK).toBe('callback');
    expect(HOOK_TYPES.REF).toBe('ref');
    expect(HOOK_TYPES.CONTEXT).toBe('context');
    expect(HOOK_TYPES.TRANSITION).toBe('transition');
    expect(HOOK_TYPES.DEFERRED_VALUE).toBe('deferred_value');
    expect(HOOK_TYPES.REDUCER).toBe('reducer');
    expect(HOOK_TYPES.ID).toBe('id');
  });

  it('JSX_PRAGMA should have fragment and createElement', () => {
    expect(JSX_PRAGMA.FRAGMENT).toBe('Fragment');
    expect(JSX_PRAGMA.CREATE_ELEMENT).toBe('jsx');
  });
});
