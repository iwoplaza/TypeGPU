import { act, render, screen } from '@testing-library/react';
import React, { Activity, Suspense } from 'react';
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

  it('recreates buffers that were destroyed while hidden', ({ root }) => {
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
    // Hidden subtrees don't hold on to their buffers
    expect(first?.destroyed).toBe(true);

    rerender(ui('visible'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(latest).not.toBe(first);
    expect(latest?.destroyed).toBe(false);
    // The recreated buffer starts from the initial value again
    expect(createBufferSpy).toHaveBeenLastCalledWith(d.f32, 1);
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

  it('recreates mirrored uniforms with the latest value', ({ root }) => {
    using createUniformSpy = vi.spyOn(root, 'createUniform');
    let latest: TgpuBuffer<d.F32> | undefined;

    function Child({ value }: { value: number }) {
      latest = useMirroredUniform(d.f32, value)[$buffer];
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
    rerender(ui('hidden', 2));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender(ui('visible', 3));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(latest?.destroyed).toBe(false);
    expect(createUniformSpy).toHaveBeenLastCalledWith(d.f32, 3);
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
