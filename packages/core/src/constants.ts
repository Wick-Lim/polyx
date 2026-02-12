// PolyX Constants
export const POLYX_TAG_PREFIX = 'polyx-';

export const HOOK_TYPES = {
  STATE: 'state',
  EFFECT: 'effect',
  LAYOUT_EFFECT: 'layout_effect',
  MEMO: 'memo',
  CALLBACK: 'callback',
  REF: 'ref',
  CONTEXT: 'context',
} as const;

export const JSX_PRAGMA = {
  FRAGMENT: 'Fragment',
  CREATE_ELEMENT: 'jsx',
} as const;
