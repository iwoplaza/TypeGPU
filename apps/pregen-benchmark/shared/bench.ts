/**
 * Dependency-free instrumentation shared by both variants of every example.
 * Everything is reported through `performance.mark` / `window.__bench`, which
 * the Playwright runner (scripts/bench.ts) reads back.
 */

type BenchState = {
  firstSubmit?: number;
  firstFrame?: number;
  interactive?: number;
  firstInteraction?: { handledAt: number; eventTimeStamp: number };
  frameCpuTimes: number[];
  errors: string[];
};

declare global {
  interface Window {
    __bench: BenchState;
  }
}

const state: BenchState = (window.__bench ??= { frameCpuTimes: [], errors: [] });

window.addEventListener('error', (e) => state.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => state.errors.push(String(e.reason)));

export function markAppStart() {
  performance.mark('app-start');
}

/**
 * Call right after the first `device.queue.submit` of the first frame.
 * `first-frame` is marked once the GPU finished that work.
 */
export function markFirstSubmit(device: GPUDevice) {
  if (state.firstSubmit !== undefined) {
    return;
  }
  state.firstSubmit = performance.now();
  performance.mark('first-submit');
  // After the microtasks already queued, so that submits deferred by the frame are included
  queueMicrotask(() => {
    void device.queue.onSubmittedWorkDone().then(() => {
      state.firstFrame = performance.now();
      performance.mark('first-frame');
    });
  });
}

/** Call once all event handlers / controls have been attached. */
export function markInteractive() {
  state.interactive = performance.now();
  performance.mark('interactive');
}

/** Wrap the CPU-side portion of a frame to collect per-frame JS cost. */
export function measureFrame(fn: () => void) {
  const start = performance.now();
  fn();
  // Microtasks queued by the frame (e.g. deferred submits) run before this one
  queueMicrotask(() => {
    const times = state.frameCpuTimes;
    if (times.length < 1000) {
      times.push(performance.now() - start);
    }
  });
}

/** Records the first user interaction that reached an example handler. */
export function recordInteraction(event?: Event) {
  if (state.firstInteraction) {
    return;
  }
  state.firstInteraction = {
    handledAt: performance.now(),
    eventTimeStamp: event?.timeStamp ?? performance.now(),
  };
  performance.mark('first-interaction');
}
