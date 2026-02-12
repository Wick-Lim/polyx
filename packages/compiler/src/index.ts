import { compile, CompilerOptions } from './compiler.js';
import type { TransformResult } from '@polyx/core';

export { compile };
export type { CompilerOptions, TransformResult };

// Convenience function for Vite plugin
export function transform(code: string, id: string, options?: CompilerOptions): TransformResult | null {
  // Only transform .jsx, .tsx files
  if (!/\.(jsx|tsx)$/.test(id)) {
    return null;
  }
  
  return compile(code, options);
}
