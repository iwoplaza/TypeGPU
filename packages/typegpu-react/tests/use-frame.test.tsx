import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFrame, type FrameCtx } from '../src/core/use-frame.ts';

let frames: Map<number, FrameRequestCallback>;
let nextFrameId: number;

/** Runs every frame that is currently scheduled */
function pumpFrame() {
  const current = [...frames.entries()];
  frames.clear();
  for (const [, cb] of current) {
    cb(performance.now());
  }
}

function FrameUser({ cb }: { cb: (ctx: FrameCtx) => void }) {
  useFrame(cb);
  return null;
}

class Catcher extends React.Component<{ children: React.ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: undefined };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    return this.state.error ? <div data-testid="error">caught</div> : this.props.children;
  }
}

describe('useFrame', () => {
  beforeEach(() => {
    frames = new Map();
    nextFrameId = 1;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        const id = nextFrameId++;
        frames.set(id, cb);
        return id;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        frames.delete(id);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the callback on mount, and then once per frame', () => {
    const cb = vi.fn();

    render(<FrameUser cb={cb} />);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith({ deltaSeconds: 0, elapsedSeconds: 0 });
    expect(frames.size).toBe(1);

    pumpFrame();
    pumpFrame();

    expect(cb).toHaveBeenCalledTimes(3);
    expect(frames.size).toBe(1);
  });

  it('stops the loop on unmount', () => {
    const cb = vi.fn();

    const { unmount } = render(<FrameUser cb={cb} />);
    unmount();

    expect(frames.size).toBe(0);
    pumpFrame();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('uses the latest callback after a re-render', () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = render(<FrameUser cb={first} />);
    rerender(<FrameUser cb={second} />);
    pumpFrame();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(1);
  });

  it('stops the loop when the callback throws on the first frame', () => {
    using _ = vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    const cb = () => {
      calls++;
      throw new Error('boom');
    };

    render(
      <Catcher>
        <FrameUser cb={cb} />
      </Catcher>,
    );

    expect(screen.getByTestId('error')).toBeDefined();
    expect(frames.size).toBe(0);

    for (let i = 0; i < 5; i++) {
      pumpFrame();
    }

    expect(calls).toBe(1);
  });

  it('stops the loop when the callback throws on a later frame', () => {
    let calls = 0;
    const cb = () => {
      calls++;
      if (calls === 3) {
        throw new Error('boom');
      }
    };

    const { unmount } = render(<FrameUser cb={cb} />);
    pumpFrame();

    expect(() => pumpFrame()).toThrow('boom');
    expect(frames.size).toBe(0);

    for (let i = 0; i < 5; i++) {
      pumpFrame();
    }
    expect(calls).toBe(3);

    unmount();
  });

  it('does not schedule another frame when the callback unmounts the component', () => {
    let unmount = () => {};
    const cb = vi.fn(() => {
      if (cb.mock.calls.length === 2) {
        unmount();
      }
    });

    ({ unmount } = render(<FrameUser cb={cb} />));
    pumpFrame();

    expect(frames.size).toBe(0);
    pumpFrame();
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
