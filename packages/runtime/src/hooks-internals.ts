import type { ComponentInstance, HookEffect } from '@polyx/core';

// Current component being rendered
let currentInstance: ComponentInstance | null = null;
let currentHookIndex = 0;

export function getCurrentInstance(): ComponentInstance | null {
  return currentInstance;
}

export function setCurrentInstance(instance: ComponentInstance | null): void {
  currentInstance = instance;
  currentHookIndex = 0;
}

export function getNextHookIndex(): number {
  return currentHookIndex++;
}

export function getCurrentHookIndex(): number {
  return currentHookIndex;
}

export function assertCurrentInstance(): ComponentInstance {
  if (!currentInstance) {
    console.error('Hook called without current instance. Stack:', new Error().stack);
    throw new Error('Hooks can only be called inside a component. Make sure hooks are called within _render method.');
  }
  return currentInstance;
}
