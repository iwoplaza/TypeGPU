import { act, render, screen } from '@testing-library/react';
import React, { Activity, Suspense, useEffect, useLayoutEffect } from 'react';
import { d, type TgpuBuffer, type TgpuRoot } from 'typegpu';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { Root, useBuffer, useMirroredUniform, useRoot } from '@typegpu/react';
import { $buffer } from '../src/core/symbols.ts';
import { it } from './utils/extended-test.tsx';

type Mode = 'visible' | 'hidden';

class Catcher extends React.Component<{ children: React.ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: undefined };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    return this.state.error ? (
      <div data-testid="error">
        {this.state.error instanceof Error ? this.state.error.message : 'Unknown error'}
      </div>
    ) : (
      this.props.children
    );
  }
}

describe('<Activity>', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps buffers alive while hidden', ({ root }) => {
    using createBufferSpy = vi.spyOn(root, 'createBuffer');
    let latest: TgpuBuffer<d.F32> | undefined;

    function Child() {
      latest = useBuffer(d.f32, { initial: 1 });
      return null;
    }

    const ui = (mode: Mode) => (
      <Root root={root}>
        <Activity mode={mode}>
          <Child />
        </Activity>
      </Root>
    );

    const { rerender } = render(ui('visible'));
    const first = latest;

    rerender(ui('hidden'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(first?.destroyed).toBe(false);

    rerender(ui('visible'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(latest).toBe(first);
    expect(latest?.destroyed).toBe(false);
    expect(createBufferSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps buffers that were hidden only briefly', ({ root }) => {
    let latest: TgpuBuffer<d.F32> | undefined;

    function Child() {
      latest = useBuffer(d.f32, { initial: 1 });
      return null;
    }

    const ui = (mode: Mode) => (
      <Root root={root}>
        <Activity mode={mode}>
          <Child />
        </Activity>
      </Root>
    );

    const { rerender } = render(ui('visible'));
    const first = latest;

    rerender(ui('hidden'));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    rerender(ui('visible'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(latest).toBe(first);
    expect(latest?.destroyed).toBe(false);
  });

  it('writes the latest value to mirrored uniforms when revealed', ({ root }) => {
    using createUniformSpy = vi.spyOn(root, 'createUniform');

    function Child({ value }: { value: number }) {
      useMirroredUniform(d.f32, value);
      return null;
    }

    const ui = (mode: Mode, value: number) => (
      <Root root={root}>
        <Activity mode={mode}>
          <Child value={value} />
        </Activity>
      </Root>
    );

    const { rerender } = render(ui('visible', 1));
    const uniform = createUniformSpy.mock.results[0]?.value as { write(value: number): void };
    using writeSpy = vi.spyOn(uniform, 'write');

    rerender(ui('hidden', 2));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender(ui('visible', 3));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(createUniformSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenLastCalledWith(3);
  });

  it('never hands a destroyed buffer to effects of a revealed subtree', ({ root }) => {
    const errors: unknown[] = [];
    const used: TgpuBuffer<d.F32>[] = [];
    const tryWrite = (buffer: TgpuBuffer<d.F32>) => {
      used.push(buffer);
      try {
        buffer.write(2);
      } catch (error) {
        errors.push(error);
      }
    };

    function Writer({ buffer }: { buffer: TgpuBuffer<d.F32> }) {
      useLayoutEffect(() => tryWrite(buffer));
      useEffect(() => tryWrite(buffer));
      return null;
    }

    function Child() {
      const buffer = useBuffer(d.f32, { initial: 1 });
      return <Writer buffer={buffer} />;
    }

    // Stable, like in tab or route caches, so React doesn't re-render it when revealed
    const child = <Child />;
    const ui = (mode: Mode) => (
      <Root root={root}>
        <Activity mode={mode}>{child}</Activity>
      </Root>
    );

    const { rerender } = render(ui('visible'));
    rerender(ui('hidden'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    used.length = 0;
    rerender(ui('visible'));

    expect(used.length).toBeGreaterThan(0);
    expect(errors).toStrictEqual([]);
    expect(used.every((buffer) => !buffer.destroyed)).toBe(true);
  });

  it('destroys buffers of a subtree that unmounts while hidden', ({ root }) => {
    let latest: TgpuBuffer<d.F32> | undefined;

    function Child() {
      latest = useBuffer(d.f32, { initial: 1 });
      return null;
    }

    const ui = (mode: Mode, mounted: boolean) => (
      <Root root={root}>{mounted && <Activity mode={mode}>{<Child />}</Activity>}</Root>
    );

    const { rerender } = render(ui('visible', true));
    rerender(ui('hidden', true));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(latest?.destroyed).toBe(false);

    rerender(ui('hidden', false));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(latest?.destroyed).toBe(true);
  });

  it('keeps the root of a <Root> provider that was hidden', async ({ navigator, adapter }) => {
    vi.mocked(navigator.gpu.requestAdapter).mockImplementation(() => Promise.resolve(adapter));
    using warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    using _errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const roots: TgpuRoot[] = [];

    function Child() {
      const root = useRoot();
      if (roots.at(-1) !== root) {
        roots.push(root);
      }
      return <div data-testid="ready">ready</div>;
    }

    const ui = (mode: Mode) => (
      <Catcher>
        <Activity mode={mode}>
          <Root>
            <Suspense fallback={<div data-testid="fallback" />}>
              <Child />
            </Suspense>
          </Root>
        </Activity>
      </Catcher>
    );

    const { rerender } = await act(async () => render(ui('visible')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('ready')).toBeDefined();

    await act(async () => rerender(ui('hidden')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => rerender(ui('visible')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(screen.queryByTestId('error')).toBeNull();
    expect(screen.getByTestId('ready')).toBeDefined();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(roots).toHaveLength(1);
  });
});
