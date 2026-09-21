import type { EncoderRecord } from './encoder.ts';
import type { NativeApi } from './native.ts';
import { ResourceRegistry } from './registry.ts';
import { SnapshotPool } from './snapshots.ts';
import { TimestampPool } from './timestamps.ts';
import type { FrameRecord, PassRecord } from './types.ts';

export interface SessionOptions {
  /** Minimum time between two frames that get their textures snapshotted, in milliseconds */
  readonly snapshotIntervalMs: number;
  /** How many timing samples to keep per pass, for averaging */
  readonly historyLength: number;
}

export type SessionEvent = 'frame' | 'timing';
export type SessionListener = (event: SessionEvent, frame: FrameRecord) => void;

const MAX_HISTORY_KEYS = 512;

/**
 * Collects passes submitted between animation frames into {@link FrameRecord}s.
 */
export class InspectorSession {
  readonly native: NativeApi;
  readonly registry = new ResourceRegistry();
  readonly timestamps: TimestampPool;
  readonly snapshots: SnapshotPool;
  readonly options: SessionOptions;

  /** Set by the UI: whether it currently wants texture snapshots */
  snapshotsEnabled = false;
  /** Set by the UI: whether to keep the currently displayed frame */
  paused = false;

  #frameIndex = 0;
  #pending: PassRecord[] = [];
  #pendingDevice: GPUDevice | undefined;
  #captureThisFrame = false;
  #lastSnapshotAt = Number.NEGATIVE_INFINITY;
  #latest: FrameRecord | undefined;
  #latestWithSnapshots: FrameRecord | undefined;
  #timingHistory = new Map<string, number[]>();
  #listeners = new Set<SessionListener>();
  #rafHandle: number | undefined;
  #commandBuffers = new WeakMap<GPUCommandBuffer, EncoderRecord>();

  constructor(native: NativeApi, options: SessionOptions) {
    this.native = native;
    this.options = options;
    this.timestamps = new TimestampPool(native);
    this.snapshots = new SnapshotPool(native);
  }

  get latestFrame(): FrameRecord | undefined {
    return this.#latest;
  }

  /** Whether passes recorded right now should have their outputs snapshotted */
  get shouldSnapshot(): boolean {
    return this.#captureThisFrame;
  }

  get frameIndex(): number {
    return this.#frameIndex;
  }

  start(): void {
    if (this.#rafHandle !== undefined || typeof requestAnimationFrame !== 'function') {
      return;
    }
    const tick = () => {
      this.#rafHandle = requestAnimationFrame(tick);
      this.#endFrame();
    };
    this.#rafHandle = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.#rafHandle !== undefined) {
      cancelAnimationFrame(this.#rafHandle);
      this.#rafHandle = undefined;
    }
  }

  subscribe(listener: SessionListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  registerCommandBuffer(commandBuffer: GPUCommandBuffer, record: EncoderRecord): void {
    this.#commandBuffers.set(commandBuffer, record);
  }

  /** Called after the app submitted command buffers to a queue */
  onSubmit(commandBuffers: Iterable<GPUCommandBuffer>): void {
    for (const commandBuffer of commandBuffers) {
      const record = this.#commandBuffers.get(commandBuffer);
      if (!record || record.submitted) {
        continue;
      }
      record.submitted = true;
      this.#pendingDevice = record.device;
      for (const pass of record.passes) {
        positions.set(pass, this.#pending.length);
        this.#pending.push(pass);
      }
      record.afterSubmit();
    }
  }

  /** Called when the GPU time of a pass becomes known */
  reportTiming(pass: PassRecord, gpuTime: number | undefined): void {
    if (gpuTime === undefined) {
      pass.timing = 'unavailable';
    } else {
      pass.timing = 'ready';
      pass.gpuTime = gpuTime;
      this.#pushHistory(pass, gpuTime);
    }
    if (this.#latest?.passes.includes(pass)) {
      this.#emit('timing', this.#latest);
    }
  }

  /** Recent GPU timings (ms) for passes with the same position, kind and label */
  getTimingHistory(pass: PassRecord): readonly number[] {
    return this.#timingHistory.get(historyKey(pass)) ?? [];
  }

  /** Immediately forget everything captured so far */
  reset(): void {
    this.#pending = [];
    this.#latest = undefined;
    this.#timingHistory.clear();
  }

  #pushHistory(pass: PassRecord, gpuTime: number): void {
    const key = historyKey(pass);
    let history = this.#timingHistory.get(key);
    if (!history) {
      if (this.#timingHistory.size >= MAX_HISTORY_KEYS) {
        const oldest = this.#timingHistory.keys().next().value;
        if (oldest !== undefined) {
          this.#timingHistory.delete(oldest);
        }
      }
      history = [];
      this.#timingHistory.set(key, history);
    }
    history.push(gpuTime);
    if (history.length > this.options.historyLength) {
      history.splice(0, history.length - this.options.historyLength);
    }
  }

  #endFrame(): void {
    const now = performance.now();

    if (this.#pending.length > 0) {
      if (this.paused) {
        // Keep showing the frozen frame, but return snapshots that were
        // taken before pausing so that they do not pile up.
        const device = this.#pendingDevice;
        if (device) {
          for (const pass of this.#pending) {
            this.snapshots.release(device, pass.snapshots);
          }
        }
        this.#pending = [];
      } else {
        const frame: FrameRecord = {
          index: ++this.#frameIndex,
          passes: this.#pending,
          hasSnapshots: this.#captureThisFrame,
          finishedAt: now,
          device: this.#pendingDevice,
        };
        this.#pending = [];

        this.#latest = frame;
        this.#emit('frame', frame);

        if (frame.hasSnapshots) {
          const previous = this.#latestWithSnapshots;
          if (previous && previous !== frame && previous.device) {
            for (const pass of previous.passes) {
              this.snapshots.release(previous.device, pass.snapshots);
            }
          }
          this.#latestWithSnapshots = frame;
        }
      }
    }

    // Decide whether the passes of the next frame should be snapshotted.
    const wantsSnapshots = this.snapshotsEnabled && !this.paused;
    this.#captureThisFrame =
      wantsSnapshots && now - this.#lastSnapshotAt >= this.options.snapshotIntervalMs;
    if (this.#captureThisFrame) {
      this.#lastSnapshotAt = now;
    }
  }

  #emit(event: SessionEvent, frame: FrameRecord): void {
    for (const listener of this.#listeners) {
      try {
        listener(event, frame);
      } catch (err) {
        console.error('[webgpu-inspector] listener failed', err);
      }
    }
  }
}

/** The position of each pass within its frame, used to correlate passes across frames */
const positions = new WeakMap<PassRecord, number>();

function historyKey(pass: PassRecord): string {
  return `${positions.get(pass) ?? -1}:${pass.kind}:${pass.label}`;
}
