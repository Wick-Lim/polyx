import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToReadableStream, buildReplacementChunk } from '../stream.js';
import { registerComponent, renderToString } from '../renderer.js';

// Helper: read a ReadableStream to a string
async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }

  return result;
}

// Mock component class for testing
function createMockComponent(templateHTML: string) {
  return {
    template: {
      innerHTML: templateHTML,
      content: { innerHTML: templateHTML },
    },
    observedAttributes: [],
  };
}

describe('renderToReadableStream', () => {
  beforeEach(() => {
    // Register a test component
    const mockComponent = createMockComponent('<div>Hello SSR Stream</div>');
    registerComponent('polyx-stream-test', mockComponent);
  });

  it('should return a ReadableStream', () => {
    const stream = renderToReadableStream('polyx-stream-test');
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it('should stream the shell HTML', async () => {
    const stream = renderToReadableStream('polyx-stream-test');
    const html = await streamToString(stream);

    expect(html).toContain('polyx-stream-test');
    expect(html).toContain('Hello SSR Stream');
  });

  it('should match renderToString output for shell', async () => {
    const stringOutput = renderToString('polyx-stream-test');
    const stream = renderToReadableStream('polyx-stream-test');
    const streamOutput = await streamToString(stream);

    expect(streamOutput).toContain(stringOutput);
  });

  it('should include bootstrap scripts when provided', async () => {
    const stream = renderToReadableStream('polyx-stream-test', {}, {
      bootstrapScripts: ['/app.js', '/vendor.js'],
    });
    const html = await streamToString(stream);

    expect(html).toContain('<script type="module" src="/app.js"></script>');
    expect(html).toContain('<script type="module" src="/vendor.js"></script>');
  });

  it('should not include script tags when no bootstrapScripts', async () => {
    const stream = renderToReadableStream('polyx-stream-test');
    const html = await streamToString(stream);

    expect(html).not.toContain('<script');
  });

  it('should pass props to renderToString', async () => {
    const mockComponent = createMockComponent('<div><span data-dyn="0"></span></div>');
    registerComponent('polyx-stream-props', mockComponent);

    const stream = renderToReadableStream('polyx-stream-props', { title: 'Test' });
    const html = await streamToString(stream);

    expect(html).toContain('polyx-stream-props');
    expect(html).toContain('title="Test"');
  });

  it('should handle aborted signal', async () => {
    const controller = new AbortController();
    controller.abort(); // Abort immediately

    const stream = renderToReadableStream('polyx-stream-test', {}, {
      signal: controller.signal,
    });

    const reader = stream.getReader();
    const { done } = await reader.read();
    expect(done).toBe(true);
  });

  it('should call onError when component is not registered', async () => {
    const onError = vi.fn();

    const stream = renderToReadableStream('polyx-nonexistent', {}, { onError });
    const reader = stream.getReader();

    try {
      await reader.read();
    } catch {
      // Expected — stream may error
    }

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

describe('renderToReadableStream with different components', () => {
  it('should stream components with attributes', async () => {
    const mockComponent = createMockComponent('<div class="container"><h1>Title</h1></div>');
    registerComponent('polyx-stream-attrs', mockComponent);

    const stream = renderToReadableStream('polyx-stream-attrs', { id: 'main' });
    const html = await streamToString(stream);

    expect(html).toContain('polyx-stream-attrs');
    expect(html).toContain('container');
  });

  it('should stream components with dynamic markers', async () => {
    const mockComponent = createMockComponent('<div><span data-dyn="0"></span><span data-dyn="1"></span></div>');
    registerComponent('polyx-stream-dyn', mockComponent);

    const stream = renderToReadableStream('polyx-stream-dyn');
    const html = await streamToString(stream);

    // Dynamic markers should be converted to comments in SSR
    expect(html).toContain('dyn-0');
    expect(html).toContain('dyn-1');
  });
});

describe('buildReplacementChunk', () => {
  it('should generate a template and script tag for boundary replacement', () => {
    const chunk = buildReplacementChunk(0, '<div>Resolved Content</div>');

    expect(chunk).toContain('<template id="$B0-content">');
    expect(chunk).toContain('<div>Resolved Content</div>');
    expect(chunk).toContain('</template>');
    expect(chunk).toContain('<script>');
    expect(chunk).toContain('document.getElementById("$B0-content")');
    expect(chunk).toContain('data-suspense-id="0"');
    expect(chunk).toContain('replaceWith');
    expect(chunk).toContain('t.remove()');
  });

  it('should use the correct boundary ID in the generated chunk', () => {
    const chunk = buildReplacementChunk(42, '<p>Hello</p>');

    expect(chunk).toContain('$B42-content');
    expect(chunk).toContain('data-suspense-id="42"');
  });

  it('should handle empty HTML content', () => {
    const chunk = buildReplacementChunk(1, '');

    expect(chunk).toContain('<template id="$B1-content"></template>');
    expect(chunk).toContain('<script>');
  });
});

describe('renderToReadableStream with pending boundaries', () => {
  beforeEach(() => {
    const mockComponent = createMockComponent('<div>Shell Content</div>');
    registerComponent('polyx-stream-boundary', mockComponent);
  });

  it('should stream resolved boundary content after the shell', async () => {
    const pendingBoundaries = new Map<number, { promise: Promise<string>; fallbackMarker: string }>();
    pendingBoundaries.set(0, {
      promise: Promise.resolve('<div>Async Content</div>'),
      fallbackMarker: '<!--$B0-->',
    });

    const stream = renderToReadableStream('polyx-stream-boundary', {}, {
      _pendingBoundaries: pendingBoundaries,
    });
    const html = await streamToString(stream);

    // Shell should be present
    expect(html).toContain('Shell Content');
    // Replacement chunk should be streamed
    expect(html).toContain('<template id="$B0-content">');
    expect(html).toContain('<div>Async Content</div>');
    expect(html).toContain('<script>');
  });

  it('should handle multiple pending boundaries', async () => {
    const pendingBoundaries = new Map<number, { promise: Promise<string>; fallbackMarker: string }>();
    pendingBoundaries.set(0, {
      promise: Promise.resolve('<div>Content A</div>'),
      fallbackMarker: '<!--$B0-->',
    });
    pendingBoundaries.set(1, {
      promise: Promise.resolve('<div>Content B</div>'),
      fallbackMarker: '<!--$B1-->',
    });

    const stream = renderToReadableStream('polyx-stream-boundary', {}, {
      _pendingBoundaries: pendingBoundaries,
    });
    const html = await streamToString(stream);

    expect(html).toContain('<template id="$B0-content">');
    expect(html).toContain('<div>Content A</div>');
    expect(html).toContain('<template id="$B1-content">');
    expect(html).toContain('<div>Content B</div>');
  });

  it('should call onError and emit error fallback when a boundary rejects', async () => {
    const onError = vi.fn();
    const pendingBoundaries = new Map<number, { promise: Promise<string>; fallbackMarker: string }>();
    pendingBoundaries.set(0, {
      promise: Promise.reject(new Error('Data fetch failed')),
      fallbackMarker: '<!--$B0-->',
    });

    const stream = renderToReadableStream('polyx-stream-boundary', {}, {
      _pendingBoundaries: pendingBoundaries,
      onError,
    });
    const html = await streamToString(stream);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toBe('Data fetch failed');
    // Error fallback HTML should be streamed
    expect(html).toContain('Error loading content');
    expect(html).toContain('<template id="$B0-content">');
  });

  it('should convert non-Error rejections to Error in onError callback', async () => {
    const onError = vi.fn();
    const pendingBoundaries = new Map<number, { promise: Promise<string>; fallbackMarker: string }>();
    pendingBoundaries.set(0, {
      promise: Promise.reject('string error'),
      fallbackMarker: '<!--$B0-->',
    });

    const stream = renderToReadableStream('polyx-stream-boundary', {}, {
      _pendingBoundaries: pendingBoundaries,
      onError,
    });
    const html = await streamToString(stream);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('string error');
    expect(html).toContain('Error loading content');
  });

  it('should emit error fallback even without onError handler', async () => {
    const pendingBoundaries = new Map<number, { promise: Promise<string>; fallbackMarker: string }>();
    pendingBoundaries.set(0, {
      promise: Promise.reject(new Error('No handler')),
      fallbackMarker: '<!--$B0-->',
    });

    const stream = renderToReadableStream('polyx-stream-boundary', {}, {
      _pendingBoundaries: pendingBoundaries,
    });
    const html = await streamToString(stream);

    expect(html).toContain('Error loading content');
  });

  it('should skip emitting resolved chunk when signal is aborted during async wait', async () => {
    const abortController = new AbortController();
    const pendingBoundaries = new Map<number, { promise: Promise<string>; fallbackMarker: string }>();

    // Create a promise that resolves after we abort
    let resolvePromise!: (value: string) => void;
    const delayedPromise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });

    pendingBoundaries.set(0, {
      promise: delayedPromise,
      fallbackMarker: '<!--$B0-->',
    });

    const stream = renderToReadableStream('polyx-stream-boundary', {}, {
      _pendingBoundaries: pendingBoundaries,
      signal: abortController.signal,
    });

    const reader = stream.getReader();

    // Read the shell chunk
    const { value: shellChunk, done: shellDone } = await reader.read();
    expect(shellDone).toBe(false);
    const decoder = new TextDecoder();
    expect(decoder.decode(shellChunk)).toContain('Shell Content');

    // Abort before the boundary resolves
    abortController.abort();

    // Now resolve the promise — the chunk should be skipped since signal is aborted
    resolvePromise('<div>Too Late</div>');

    // The stream should close (the abort handler closes it)
    const { done } = await reader.read();
    expect(done).toBe(true);
  });

  it('should include bootstrap scripts before streaming boundaries', async () => {
    const pendingBoundaries = new Map<number, { promise: Promise<string>; fallbackMarker: string }>();
    pendingBoundaries.set(0, {
      promise: Promise.resolve('<div>Async</div>'),
      fallbackMarker: '<!--$B0-->',
    });

    const stream = renderToReadableStream('polyx-stream-boundary', {}, {
      _pendingBoundaries: pendingBoundaries,
      bootstrapScripts: ['/main.js'],
    });
    const html = await streamToString(stream);

    expect(html).toContain('<script type="module" src="/main.js"></script>');
    expect(html).toContain('<template id="$B0-content">');
  });
});

describe('renderToReadableStream signal abort after start', () => {
  beforeEach(() => {
    const mockComponent = createMockComponent('<div>Signal Test</div>');
    registerComponent('polyx-stream-signal', mockComponent);
  });

  it('should close the stream when signal is aborted after streaming starts', async () => {
    const abortController = new AbortController();

    const stream = renderToReadableStream('polyx-stream-signal', {}, {
      signal: abortController.signal,
    });

    const reader = stream.getReader();

    // Read the shell (stream is not yet aborted)
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    const decoder = new TextDecoder();
    expect(decoder.decode(value)).toContain('Signal Test');

    // The stream is already closed (no pending boundaries), so aborting
    // after close triggers the catch block in the abort handler (lines 58-60)
    abortController.abort();

    // Stream should already be done since there were no pending boundaries
    const result = await reader.read();
    expect(result.done).toBe(true);
  });

  it('should handle abort on a stream with pending boundaries that closes the controller', async () => {
    const abortController = new AbortController();

    // Use a never-resolving promise to keep the stream open
    const pendingBoundaries = new Map<number, { promise: Promise<string>; fallbackMarker: string }>();
    pendingBoundaries.set(0, {
      promise: new Promise<string>(() => {}), // Never resolves
      fallbackMarker: '<!--$B0-->',
    });

    const stream = renderToReadableStream('polyx-stream-signal', {}, {
      signal: abortController.signal,
      _pendingBoundaries: pendingBoundaries,
    });

    const reader = stream.getReader();

    // Read shell chunk
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    const decoder = new TextDecoder();
    expect(decoder.decode(value)).toContain('Signal Test');

    // Abort while boundaries are pending — should close the stream via abort handler
    abortController.abort();

    // Stream should be closed by the abort handler
    const result = await reader.read();
    expect(result.done).toBe(true);
  });

  it('should handle Promise.all catch when a boundary promise handler throws unexpectedly', async () => {
    // This test covers the .catch() on Promise.all (line 110).
    // We trigger it by having the error-path enqueue fail because the
    // controller was already closed by an abort signal.
    const abortController = new AbortController();

    let rejectBoundary!: (reason: any) => void;
    const boundaryPromise = new Promise<string>((_, reject) => {
      rejectBoundary = reject;
    });

    const pendingBoundaries = new Map<number, { promise: Promise<string>; fallbackMarker: string }>();
    pendingBoundaries.set(0, {
      promise: boundaryPromise,
      fallbackMarker: '<!--$B0-->',
    });

    const stream = renderToReadableStream('polyx-stream-signal', {}, {
      signal: abortController.signal,
      _pendingBoundaries: pendingBoundaries,
    });

    const reader = stream.getReader();

    // Read the shell
    const { done } = await reader.read();
    expect(done).toBe(false);

    // Abort the signal — this closes the controller
    abortController.abort();

    // Now reject the boundary. The error handler tries to enqueue an error
    // fallback chunk but the controller is already closed, which throws.
    // That throw should be caught by Promise.all().catch().
    rejectBoundary(new Error('late failure'));

    // Stream should already be closed
    const result = await reader.read();
    expect(result.done).toBe(true);
  });
});
