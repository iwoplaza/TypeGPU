import { act, render } from '@testing-library/react';
import type { FunctionComponent } from 'react';
import { d, type TgpuBuffer } from 'typegpu';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { Root, useBuffer } from '@typegpu/react';
import { it } from './utils/extended-test.tsx';

interface Family {
  current: unknown;
}

interface RefreshRenderer {
  scheduleRefresh(
    root: unknown,
    update: { staleFamilies: Set<Family>; updatedFamilies: Set<Family> },
  ): void;
  setRefreshHandler(handler: (type: unknown) => Family | undefined): void;
}

// The part of the React DevTools hook that `react-refresh` uses to hot-update components.
// It has to be in place before `react-dom` loads.
const devtools = vi.hoisted(() => {
  const state = { renderers: [] as RefreshRenderer[], roots: new Set<unknown>() };
  (globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer: RefreshRenderer) {
      state.renderers.push(renderer);
      return state.renderers.length;
    },
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_id: number, root: unknown) {
      state.roots.add(root);
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
  return state;
});

/**
 * Re-renders every mounted `prev` as `next` while keeping its state, the same way
 * a Fast Refresh hot update does.
 */
function hotUpdate(prev: FunctionComponent, next: FunctionComponent) {
  const family: Family = { current: next };
  for (const renderer of devtools.renderers) {
    renderer.setRefreshHandler((type) => (type === prev || type === next ? family : undefined));
    for (const root of devtools.roots) {
      renderer.scheduleRefresh(root, {
        staleFamilies: new Set(),
        updatedFamilies: new Set([family]),
      });
    }
  }
}

describe('Fast Refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    devtools.roots.clear();
  });

  it('keeps buffers alive after a hot update', ({ root }) => {
    using createBufferSpy = vi.spyOn(root, 'createBuffer');
    let latest: TgpuBuffer<d.F32> | undefined;
    let renderedAs: string | undefined;

    function Before() {
      renderedAs = 'Before';
      latest = useBuffer(d.f32, { initial: 1 });
      return null;
    }

    function After() {
      renderedAs = 'After';
      latest = useBuffer(d.f32, { initial: 1 });
      return null;
    }

    const { unmount } = render(
      <Root root={root}>
        <Before />
      </Root>,
    );
    const first = latest;

    act(() => {
      hotUpdate(Before, After);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(renderedAs).toBe('After');
    expect(latest).toBe(first);
    expect(latest?.destroyed).toBe(false);
    expect(createBufferSpy).toHaveBeenCalledTimes(1);

    unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(first?.destroyed).toBe(true);
  });
});
