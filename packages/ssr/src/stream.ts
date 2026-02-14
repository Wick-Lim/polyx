// Streaming SSR for PolyX components
// Uses Web ReadableStream API for progressive HTML delivery

import { VNode, VTextNode, VCommentNode } from './vdom.js';
import {
  renderToString,
  renderWithSuspense,
  getTemplateHTML,
  getStateDefaults,
  parseHTML,
  renderTemplate,
} from './renderer.js';
import type { SuspenseRenderContext } from './renderer.js';

interface StreamOptions {
  /** Bootstrap script URLs to include at the end of the shell */
  bootstrapScripts?: string[];
  /** Error handler for async rendering errors */
  onError?: (error: Error) => void;
  /** AbortSignal to cancel streaming */
  signal?: AbortSignal;
  /** Timeout in ms for pending Suspense boundaries (default: 30000) */
  suspenseTimeout?: number;
  /** @internal Inject pending boundaries for testing */
  _pendingBoundaries?: Map<number, { promise: Promise<string>; fallbackMarker: string }>;
  /** @internal Use Suspense-aware rendering for shell */
  _useSuspense?: boolean;
  /** @internal Suspense render context for testing */
  _suspenseContext?: SuspenseRenderContext;
}

// Unique boundary ID counter
let _boundaryId = 0;

/**
 * Render a component to a ReadableStream for streaming SSR.
 *
 * Two-phase rendering:
 * 1. Shell: Synchronous render of the component tree. Suspense boundaries
 *    emit fallback HTML with `<!--$B{id}-->` markers.
 * 2. Streaming: As async data resolves, `<template>` + `<script>` chunks
 *    are streamed to replace the fallback content.
 */
export function renderToReadableStream(
  tagName: string,
  props: Record<string, any> = {},
  options: StreamOptions = {}
): ReadableStream<Uint8Array> {
  const {
    bootstrapScripts = [],
    onError,
    signal,
    suspenseTimeout = 30000,
    _pendingBoundaries,
    _useSuspense,
    _suspenseContext,
  } = options;
  const encoder = new TextEncoder();

  // Legacy pending boundaries for backward compat
  const legacyBoundaries = _pendingBoundaries ?? new Map<number, {
    promise: Promise<string>;
    fallbackMarker: string;
  }>();

  // Suspense render context
  const suspenseCtx: SuspenseRenderContext = _suspenseContext ?? {
    boundaryIdCounter: 0,
    pendingBoundaries: new Map(),
  };

  _boundaryId = 0;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) {
        controller.close();
        return;
      }

      signal?.addEventListener('abort', () => {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      try {
        // Phase 1: Render shell
        let shellHTML: string;
        if (_useSuspense) {
          // Suspense-aware rendering: catches thrown Promises
          shellHTML = renderWithSuspense(tagName, props, suspenseCtx);
        } else {
          shellHTML = renderToString(tagName, props);
        }

        // Emit shell
        controller.enqueue(encoder.encode(shellHTML));

        // Emit bootstrap scripts
        if (bootstrapScripts.length > 0) {
          const scriptTags = bootstrapScripts
            .map(src => `<script type="module" src="${src}"></script>`)
            .join('');
          controller.enqueue(encoder.encode(scriptTags));
        }

        // Merge Suspense boundaries into legacy boundaries for unified streaming
        const allBoundaries = new Map<number, { promise: Promise<string>; fallbackMarker?: string; fallbackHTML?: string }>();

        for (const [id, boundary] of legacyBoundaries) {
          allBoundaries.set(id, boundary);
        }
        for (const [id, boundary] of suspenseCtx.pendingBoundaries) {
          allBoundaries.set(id, boundary);
        }

        // Phase 2: Stream async chunks (if any pending boundaries exist)
        if (allBoundaries.size > 0) {
          // Apply timeout to all promises
          const timeoutPromise = suspenseTimeout > 0
            ? new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Suspense timeout')), suspenseTimeout))
            : null;

          const promises = Array.from(allBoundaries.entries()).map(
            async ([id, boundary]) => {
              try {
                let html: string;
                if (timeoutPromise) {
                  html = await Promise.race([boundary.promise, timeoutPromise]);
                } else {
                  html = await boundary.promise;
                }
                if (signal?.aborted) return;

                // Emit replacement chunk: <template> with content + <script> to swap
                const chunk = buildReplacementChunk(id, html);
                controller.enqueue(encoder.encode(chunk));
              } catch (error) {
                if (onError) {
                  onError(error instanceof Error ? error : new Error(String(error)));
                }
                // Emit error fallback
                const errorChunk = buildReplacementChunk(
                  id,
                  `<span style="color:red;">Error loading content</span>`
                );
                controller.enqueue(encoder.encode(errorChunk));
              }
            }
          );

          Promise.all(promises).then(() => {
            if (!signal?.aborted) {
              controller.close();
            }
          }).catch(() => {
            try { controller.close(); } catch { /* noop */ }
          });
        } else {
          // No async boundaries — close immediately
          controller.close();
        }
      } catch (error) {
        if (onError) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
        try {
          controller.error(error);
        } catch {
          // Already errored
        }
      }
    },
  });
}

/**
 * Build a streaming replacement chunk.
 * Sends a <template> with the resolved content and a <script> to swap it
 * into the DOM, replacing the suspense fallback.
 * Includes auto-hydration trigger for newly streamed content.
 */
export function buildReplacementChunk(boundaryId: number, html: string): string {
  return `<template id="$B${boundaryId}-content">${html}</template>` +
    `<script>` +
    `(function(){` +
    `var t=document.getElementById("$B${boundaryId}-content");` +
    `if(!t)return;` +
    `var s=document.querySelector('[data-suspense-id="${boundaryId}"]');` +
    `if(s){` +
    `var d=document.createElement("div");` +
    `d.style.display="contents";` +
    `d.innerHTML=t.innerHTML;` +
    `s.replaceWith(d);` +
    // Auto-hydrate newly inserted content
    `var h=d.querySelectorAll("[data-polyx-hydrate]");` +
    `if(h.length&&window.__POLYX_HYDRATE__)window.__POLYX_HYDRATE__(d);` +
    `}` +
    `t.remove();` +
    `})()` +
    `</script>`;
}
