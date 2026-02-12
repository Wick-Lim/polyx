import type { Plugin, HmrContext } from 'vite';
import { compile } from '@polyx/compiler';
import type { CompilerOptions } from '@polyx/core';

export interface PolyxPluginOptions extends CompilerOptions {
  include?: string | RegExp | (string | RegExp)[];
  exclude?: string | RegExp | (string | RegExp)[];
}

export default function polyxPlugin(options: PolyxPluginOptions = {}): Plugin {
  const {
    include = [/\.(jsx|tsx)$/],
    exclude = /node_modules/,
    ...compilerOptions
  } = options;

  let isDev = false;

  return {
    name: 'polyx',
    enforce: 'pre',

    configResolved(config) {
      isDev = config.command === 'serve';
    },

    transform(code: string, id: string) {
      const shouldInclude = checkInclude(id, include, exclude);
      if (!shouldInclude) {
        return null;
      }

      try {
        const result = compile(code, {
          sourceMap: true,
          ...compilerOptions,
        });

        let finalCode = result.code;

        // Inject HMR accept code in dev mode
        if (isDev) {
          finalCode += `\n${generateHMRCode(id)}`;
        }

        return {
          code: finalCode,
          map: result.map ? JSON.parse(result.map) : null,
        };
      } catch (error) {
        this.error(`PolyX compilation failed for ${id}: ${error}`);
        return null;
      }
    },

    handleHotUpdate(ctx: HmrContext) {
      const { file, modules } = ctx;
      if (checkInclude(file, include, exclude)) {
        // Return affected modules for HMR update
        return modules;
      }
    },

    config() {
      return {
        esbuild: {
          jsx: 'preserve',
        },
      };
    },
  };
}

function generateHMRCode(id: string): string {
  return `
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule && window.__POLYX_HMR__) {
      window.__POLYX_HMR__.update(newModule);
    }
  });
}`;
}

function checkInclude(
  id: string,
  include: string | RegExp | (string | RegExp)[],
  exclude: string | RegExp | (string | RegExp)[]
): boolean {
  const excludes = Array.isArray(exclude) ? exclude : [exclude];
  for (const pattern of excludes) {
    if (matchesPattern(id, pattern)) {
      return false;
    }
  }

  const includes = Array.isArray(include) ? include : [include];
  for (const pattern of includes) {
    if (matchesPattern(id, pattern)) {
      return true;
    }
  }

  return false;
}

function matchesPattern(id: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return id.includes(pattern);
  }
  return pattern.test(id);
}
