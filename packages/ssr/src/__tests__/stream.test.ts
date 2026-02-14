import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToReadableStream } from '../stream.js';
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
