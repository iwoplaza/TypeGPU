import { act, render } from '@testing-library/react';
import { StrictMode, Suspense, startTransition, use, useEffect, useLayoutEffect } from 'react';
import { d, type TgpuBuffer, type TgpuRoot } from 'typegpu';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import {
  Root,
  useBuffer,
  useMirroredUniform,
  useMutable,
  useReadonly,
  useUniform,
} from '@typegpu/react';
import { $buffer } from '../src/core/symbols.ts';
import { it } from './utils/extended-test.tsx';

type Schema = d.F32 | d.Vec2f;
type CreateMethod = 'createBuffer' | 'createUniform' | 'createMutable' | 'createReadonly';

interface HookCase {
  name: string;
  method: CreateMethod;
  use(schema: Schema): unknown;
  bufferOf(resource: unknown): TgpuBuffer<d.AnyData>;
}

const valueFor = (schema: Schema) => (schema === d.f32 ? 1 : d.vec2f(1, 2));

const hookCases: HookCase[] = [
  {
    name: 'useBuffer',
    method: 'createBuffer',
    use: (schema) => useBuffer(schema),
    bufferOf: (resource) => resource as TgpuBuffer<d.AnyData>,
  },
  {
    name: 'useUniform',
    method: 'createUniform',
    use: (schema) => useUniform(schema),
    bufferOf: (resource) => (resource as { buffer: TgpuBuffer<d.AnyData> }).buffer,
  },
  {
    name: 'useMutable',
    method: 'createMutable',
    use: (schema) => useMutable(schema),
    bufferOf: (resource) => (resource as { buffer: TgpuBuffer<d.AnyData> }).buffer,
  },
  {
    name: 'useReadonly',
    method: 'createReadonly',
    use: (schema) => useReadonly(schema),
    bufferOf: (resource) => (resource as { buffer: TgpuBuffer<d.AnyData> }).buffer,
  },
  {
    name: 'useMirroredUniform',
    method: 'createUniform',
    use: (schema) => useMirroredUniform(schema, valueFor(schema)),
    bufferOf: (resource) => (resource as { [$buffer]: TgpuBuffer<d.AnyData> })[$buffer],
  },
];

/** Collects every buffer created through `method` on the root */
function trackBuffers(root: TgpuRoot, hook: HookCase) {
  const spy = vi.spyOn(root, hook.method);
  const buffers = () =>
    spy.mock.results.map((result) =>
      hook.method === 'createBuffer'
        ? (result.value as TgpuBuffer<d.AnyData>)
        : (result.value as { buffer: TgpuBuffer<d.AnyData> }).buffer,
    );

  return {
    buffers,
    alive: () => buffers().filter((buffer) => !buffer.destroyed),
    [Symbol.dispose]: () => spy.mockRestore(),
  };
}

const neverResolves = new Promise<never>(() => {});

describe.each(hookCases)('$name', (hook) => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function User({ schema, onCommit }: { schema: Schema; onCommit?: (resource: unknown) => void }) {
    const resource = hook.use(schema);
    useEffect(() => {
      onCommit?.(resource);
    });
    return null;
  }

  it('creates a buffer on mount, and destroys it after unmount', ({ root }) => {
    using tracker = trackBuffers(root, hook);

    const { unmount } = render(
      <Root root={root}>
        <User schema={d.f32} />
      </Root>,
    );

    expect(tracker.buffers()).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(tracker.alive()).toHaveLength(1);

    unmount();
    expect(tracker.alive()).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(tracker.alive()).toHaveLength(0);
  });

  it('destroys the previous buffer once the schema change commits', ({ root }) => {
    using tracker = trackBuffers(root, hook);
    let committed: unknown;
    const onCommit = (resource: unknown) => {
      committed = resource;
    };

    const { rerender } = render(
      <Root root={root}>
        <User schema={d.f32} onCommit={onCommit} />
      </Root>,
    );
    const first = hook.bufferOf(committed);

    rerender(
      <Root root={root}>
        <User schema={d.vec2f} onCommit={onCommit} />
      </Root>,
    );

    expect(first.destroyed).toBe(true);
    expect(hook.bufferOf(committed).destroyed).toBe(false);
    expect(hook.bufferOf(committed).dataType).toBe(d.vec2f);
    expect(tracker.alive()).toEqual([hook.bufferOf(committed)]);
  });

  it('keeps the committed buffer alive when a schema change never commits', ({ root }) => {
    using tracker = trackBuffers(root, hook);
    let committed: unknown;

    function Suspending({ schema, suspend }: { schema: Schema; suspend: boolean }) {
      const resource = hook.use(schema);
      useEffect(() => {
        committed = resource;
      });
      if (suspend) {
        use(neverResolves);
      }
      return null;
    }

    const { rerender, unmount } = render(
      <Root root={root}>
        <Suspense fallback={null}>
          <Suspending schema={d.f32} suspend={false} />
        </Suspense>
      </Root>,
    );
    const first = hook.bufferOf(committed);

    act(() => {
      startTransition(() => {
        rerender(
          <Root root={root}>
            <Suspense fallback={null}>
              <Suspending schema={d.vec2f} suspend />
            </Suspense>
          </Root>,
        );
      });
    });
    vi.advanceTimersByTime(5000);

    expect(hook.bufferOf(committed)).toBe(first);
    expect(first.destroyed).toBe(false);
    // The render may still commit, so its buffer stays around until the component is done with it
    expect(tracker.alive()).toHaveLength(2);

    unmount();
    vi.advanceTimersByTime(5000);
    expect(tracker.alive()).toHaveLength(0);
  });

  it('destroys the committed buffer of a tree that mounted after a sibling suspended', async ({
    root,
  }) => {
    using tracker = trackBuffers(root, hook);
    let committed: unknown;
    let resolve = () => {};
    const promise = new Promise<void>((r) => {
      resolve = r;
    });

    function Suspender() {
      use(promise);
      return null;
    }

    const { unmount } = await act(async () =>
      render(
        <Root root={root}>
          <Suspense fallback={null}>
            <User
              schema={d.f32}
              onCommit={(resource) => {
                committed = resource;
              }}
            />
            <Suspender />
          </Suspense>
        </Root>,
      ),
    );

    await act(async () => {
      resolve();
    });
    vi.advanceTimersByTime(5000);
    expect(hook.bufferOf(committed).destroyed).toBe(false);

    unmount();
    vi.advanceTimersByTime(5000);
    expect(hook.bufferOf(committed).destroyed).toBe(true);
    // Buffers from the attempts React threw away before the first commit are left to the
    // garbage collector. The component never mounted, so nothing would tell us to destroy them.
  });

  it('hands a live buffer to effects when the commit takes long', ({ root }) => {
    using tracker = trackBuffers(root, hook);
    let committed: unknown;

    // Runs before the passive effects of the same commit
    function TimeTravel() {
      useLayoutEffect(() => {
        vi.advanceTimersByTime(5000);
      }, []);
      return null;
    }

    render(
      <Root root={root}>
        <User
          schema={d.f32}
          onCommit={(resource) => {
            committed = resource;
          }}
        />
        <TimeTravel />
      </Root>,
    );

    expect(tracker.buffers()).toHaveLength(1);
    expect(hook.bufferOf(committed).destroyed).toBe(false);
  });

  it('reuses the buffer of a schema change that stayed suspended for a while', async ({ root }) => {
    using tracker = trackBuffers(root, hook);
    const seen: TgpuBuffer<d.AnyData>[] = [];
    let resolve = () => {};
    const promise = new Promise<void>((r) => {
      resolve = r;
    });

    function Suspender({ suspend }: { suspend: boolean }) {
      if (suspend) {
        use(promise);
      }
      return null;
    }

    const tree = (schema: Schema, suspend: boolean) => (
      <Root root={root}>
        <Suspense fallback={null}>
          <User schema={schema} onCommit={(resource) => seen.push(hook.bufferOf(resource))} />
          <Suspender suspend={suspend} />
        </Suspense>
      </Root>
    );

    const { rerender } = await act(async () => render(tree(d.f32, false)));
    await act(async () => {
      startTransition(() => rerender(tree(d.vec2f, true)));
    });
    vi.advanceTimersByTime(5000);
    await act(async () => {
      resolve();
    });

    const last = seen.at(-1);
    expect(last?.dataType).toBe(d.vec2f);
    expect(seen.every((buffer) => buffer === seen[0] || buffer === last)).toBe(true);
    expect(seen.some((buffer) => buffer.destroyed && buffer === last)).toBe(false);
    // One for `d.f32`, one for `d.vec2f`, the retry after the promise resolved reused it
    expect(tracker.buffers()).toHaveLength(2);
    expect(tracker.alive()).toEqual([last]);
  });

  it('does not leak buffers in StrictMode', ({ root }) => {
    using tracker = trackBuffers(root, hook);
    let committed: unknown;

    const { unmount } = render(
      <StrictMode>
        <Root root={root}>
          <User
            schema={d.f32}
            onCommit={(resource) => {
              committed = resource;
            }}
          />
        </Root>
      </StrictMode>,
    );

    vi.advanceTimersByTime(5000);
    expect(tracker.alive()).toEqual([hook.bufferOf(committed)]);

    unmount();
    vi.advanceTimersByTime(5000);
    expect(tracker.alive()).toHaveLength(0);
  });
});

describe('useBuffer schema changes', () => {
  it('keeps at most two buffers alive while the schema changes every frame', ({ root }) => {
    vi.useFakeTimers();
    using createBufferSpy = vi.spyOn(root, 'createBuffer');
    let peak = 0;
    const alive = () =>
      createBufferSpy.mock.results.filter(
        (result) => !(result.value as TgpuBuffer<d.AnyData>).destroyed,
      ).length;

    function Resizable({ size }: { size: number }) {
      useBuffer(d.arrayOf(d.f32, size));
      peak = Math.max(peak, alive());
      return null;
    }

    const { rerender } = render(
      <Root root={root}>
        <Resizable size={1} />
      </Root>,
    );
    for (let size = 2; size <= 20; size++) {
      vi.advanceTimersByTime(16);
      rerender(
        <Root root={root}>
          <Resizable size={size} />
        </Root>,
      );
      peak = Math.max(peak, alive());
    }
    vi.useRealTimers();

    expect(createBufferSpy).toHaveBeenCalledTimes(20);
    expect(peak).toBeLessThanOrEqual(2);
    expect(alive()).toBe(1);
  });
});

describe.each(hookCases.filter((hook) => hook.name !== 'useMirroredUniform'))(
  '$name options',
  (hook) => {
    it('passes the initial value and calls onInit', ({ root }) => {
      using tracker = trackBuffers(root, hook);
      const onInit = vi.fn();

      const options = { initial: 2, onInit };
      function User() {
        // oxlint-disable-next-line typescript/no-explicit-any -- the hooks have different option types
        const useHook = { useBuffer, useUniform, useMutable, useReadonly }[hook.name] as any;
        useHook(d.f32, options);
        return null;
      }

      render(
        <Root root={root}>
          <User />
        </Root>,
      );

      expect(tracker.buffers()).toHaveLength(1);
      expect(root[hook.method]).toHaveBeenCalledWith(d.f32, 2);
      expect(onInit).toHaveBeenCalledTimes(1);
    });
  },
);

describe('useMirroredUniform writes', () => {
  it('does not write values from a render that never commits', ({ root }) => {
    function Mirrored({ value, suspend }: { value: number; suspend: boolean }) {
      useMirroredUniform(d.f32, value);
      if (suspend) {
        use(neverResolves);
      }
      return null;
    }

    const { rerender } = render(
      <Root root={root}>
        <Suspense fallback={null}>
          <Mirrored value={1} suspend={false} />
        </Suspense>
      </Root>,
    );
    expect(root.device.queue.writeBuffer).not.toHaveBeenCalled();

    act(() => {
      startTransition(() => {
        rerender(
          <Root root={root}>
            <Suspense fallback={null}>
              <Mirrored value={2} suspend />
            </Suspense>
          </Root>,
        );
      });
    });

    expect(root.device.queue.writeBuffer).not.toHaveBeenCalled();
  });
});
