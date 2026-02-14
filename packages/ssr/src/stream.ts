// Streaming SSR for PolyX components
// Uses Web ReadableStream API for progressive HTML delivery

import { VNode, VTextNode, VCommentNode } from './vdom.js';
import {
  renderToString,
  getTemplateHTML,
  getStateDefaults,
  parseHTML,
  renderTemplate,
} from './renderer.js';

interface StreamOptions {
  /** Bootstrap script URLs to include at the end of the shell */
  bootstrapScripts?: string[];
  /** Error handler for async rendering errors */
  onError?: (error: Error) => void;
  /** AbortSignal to cancel streaming */
  signal?: AbortSignal;
  /** @internal Inject pending boundaries for testing */
  _pendingBoundaries?: Map<number, { promise: Promise<string>; fallbackMarker: string }>;
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
  const { bootstrapScripts = [], onError, signal, _pendingBoundaries } = options;
  const encoder = new TextEncoder();
  const pendingBoundaries = _pendingBoundaries ?? new Map<number, {
    promise: Promise<string>;
    fallbackMarker: string;
  }>();

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
        // Phase 1: Render shell synchronously
        const shellHTML = renderToString(tagName, props);

        // Emit shell
        controller.enqueue(encoder.encode(shellHTML));

        // Emit bootstrap scripts
        if (bootstrapScripts.length > 0) {
          const scriptTags = bootstrapScripts
            .map(src => `<script type="module" src="${src}"></script>`)
            .join('');
          controller.enqueue(encoder.encode(scriptTags));
        }

        // Phase 2: Stream async chunks (if any pending boundaries exist)
        if (pendingBoundaries.size > 0) {
          const promises = Array.from(pendingBoundaries.entries()).map(
            async ([id, boundary]) => {
              try {
                const html = await boundary.promise;
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
    `}` +
    `t.remove();` +
    `})()` +
    `</script>`;
}
