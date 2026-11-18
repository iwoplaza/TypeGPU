/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockAudioLoading, mockResizeObserver } from './utils/commonMocks.ts';

const IPHONE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';

// Captured before any test spies on them
const addWindowListener = window.addEventListener;
const removeWindowListener = window.removeEventListener;

const examples = [
  { category: 'simulation', name: 'slime-mold' },
  { category: 'simulation', name: 'slime-mold-3d' },
  // These register an 'orientationchange' listener on iOS only
  { category: 'image-processing', name: 'ascii-filter' },
  { category: 'image-processing', name: 'camera-thresholding' },
  { category: 'image-processing', name: 'chroma-keying' },
  {
    category: 'rendering',
    name: 'jelly-switch',
    setupMocks: () => {
      mockResizeObserver();
      mockAudioLoading();
    },
  },
  { category: 'algorithms', name: 'jump-flood-voronoi' },
];

describe.each(examples)('$name example cleanup', ({ category, name, setupMocks }) => {
  beforeEach(() => {
    // Lets `setupCommonMocks` and the next `beforeEach` both redefine the user agent
    Object.defineProperty(navigator, 'userAgent', { value: '', configurable: true });
  });
  setupCommonMocks();
  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE_USER_AGENT, configurable: true });
    Object.defineProperty(screen, 'orientation', {
      value: { type: 'landscape-primary' },
      configurable: true,
    });
  });

  it('stops scheduling work and removes window listeners', async ({ device }) => {
    const windowListeners = new Set<EventListenerOrEventListenerObject>();
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      if (listener) {
        windowListeners.add(listener);
      }
      addWindowListener.call(window, type, listener, options);
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
      if (listener) {
        windowListeners.delete(listener);
      }
      removeWindowListener.call(window, type, listener, options);
    });

    const pendingFrames = new Set<number>();
    let nextFrameId = 1;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => {
      const id = nextFrameId++;
      pendingFrames.add(id);
      return id;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      pendingFrames.delete(id);
    });

    // Runs the example's `onCleanup` before returning
    await runExampleTest({ category, name, setupMocks }, device);

    const submitsAtCleanup = device.mock.queue.submit.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(windowListeners.size).toBe(0);
    expect(pendingFrames.size).toBe(0);
    expect(device.mock.queue.submit.mock.calls.length).toBe(submitsAtCleanup);
  });
});
