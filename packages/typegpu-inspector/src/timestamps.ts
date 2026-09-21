import type { NativeApi } from './native.ts';

/** Number of timestamp queries reserved per encoder for passes the inspector instruments itself */
export const OWN_QUERY_CAPACITY = 128;
/** Number of 256-byte aligned slots for resolving single queries out of app-owned query sets */
export const FOREIGN_SLOT_CAPACITY = 32;

const OWN_BYTES = OWN_QUERY_CAPACITY * 8;
const SLOT_BYTES = 256;
export const TIMESTAMP_BUFFER_SIZE = OWN_BYTES + FOREIGN_SLOT_CAPACITY * SLOT_BYTES;

/** Maximum number of in-flight entries per device, to bound memory if command buffers are never submitted */
const MAX_ENTRIES_PER_DEVICE = 64;

export interface TimestampEntry {
  readonly querySet: GPUQuerySet;
  readonly resolveBuffer: GPUBuffer;
  readonly readbackBuffer: GPUBuffer;
}

interface DevicePool {
  free: TimestampEntry[];
  total: number;
}

/**
 * Pools query sets and readback buffers used for timing passes.
 */
export class TimestampPool {
  readonly #pools = new WeakMap<GPUDevice, DevicePool>();
  readonly #native: NativeApi;

  constructor(native: NativeApi) {
    this.#native = native;
  }

  static supports(device: GPUDevice): boolean {
    return device.features.has('timestamp-query');
  }

  acquire(device: GPUDevice): TimestampEntry | undefined {
    let pool = this.#pools.get(device);
    if (!pool) {
      pool = { free: [], total: 0 };
      this.#pools.set(device, pool);
    }

    const reused = pool.free.pop();
    if (reused) {
      return reused;
    }

    if (pool.total >= MAX_ENTRIES_PER_DEVICE) {
      return undefined;
    }

    pool.total++;
    const querySet = device.createQuerySet({
      label: 'webgpu-inspector timestamps',
      type: 'timestamp',
      count: OWN_QUERY_CAPACITY,
    });
    const resolveBuffer = this.#native.createBuffer.call(device, {
      label: 'webgpu-inspector timestamp resolve',
      size: TIMESTAMP_BUFFER_SIZE,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    const readbackBuffer = this.#native.createBuffer.call(device, {
      label: 'webgpu-inspector timestamp readback',
      size: TIMESTAMP_BUFFER_SIZE,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    return { querySet, resolveBuffer, readbackBuffer };
  }

  release(device: GPUDevice, entry: TimestampEntry): void {
    const pool = this.#pools.get(device);
    if (pool) {
      pool.free.push(entry);
    }
  }

  discard(device: GPUDevice, entry: TimestampEntry): void {
    const pool = this.#pools.get(device);
    if (pool) {
      pool.total--;
    }
    try {
      entry.querySet.destroy();
      entry.resolveBuffer.destroy();
      entry.readbackBuffer.destroy();
    } catch {
      // The device may already be lost.
    }
  }
}

export interface OwnTimestampRef {
  readonly kind: 'own';
  readonly beginIndex: number;
  readonly endIndex: number;
}

export interface ForeignTimestampRef {
  readonly kind: 'foreign';
  readonly querySet: GPUQuerySet;
  readonly beginQuery: number;
  readonly endQuery: number;
  readonly beginSlot: number;
  readonly endSlot: number;
}

export type TimestampRef = OwnTimestampRef | ForeignTimestampRef;

/**
 * Hands out timestamp query indices for the passes of a single command encoder,
 * and knows how to resolve and read them back.
 */
export class EncoderTimestamps {
  readonly entry: TimestampEntry;
  #ownUsed = 0;
  #foreignUsed = 0;

  constructor(entry: TimestampEntry) {
    this.entry = entry;
  }

  get ownUsed(): number {
    return this.#ownUsed;
  }

  get foreignUsed(): number {
    return this.#foreignUsed;
  }

  get isEmpty(): boolean {
    return this.#ownUsed === 0 && this.#foreignUsed === 0;
  }

  /**
   * Returns timestamp writes to inject into a pass descriptor, or undefined if
   * the capacity has been exhausted.
   */
  allocateOwn(): { ref: OwnTimestampRef; writes: GPUComputePassTimestampWrites } | undefined {
    if (this.#ownUsed + 2 > OWN_QUERY_CAPACITY) {
      return undefined;
    }
    const beginIndex = this.#ownUsed;
    const endIndex = this.#ownUsed + 1;
    this.#ownUsed += 2;
    return {
      ref: { kind: 'own', beginIndex, endIndex },
      writes: {
        querySet: this.entry.querySet,
        beginningOfPassWriteIndex: beginIndex,
        endOfPassWriteIndex: endIndex,
      },
    };
  }

  /**
   * Registers timestamp writes that the app set up itself, so their results
   * can be read alongside the inspector's own.
   */
  adoptForeign(writes: GPUComputePassTimestampWrites): ForeignTimestampRef | undefined {
    const { beginningOfPassWriteIndex, endOfPassWriteIndex, querySet } = writes;
    if (
      beginningOfPassWriteIndex === undefined ||
      endOfPassWriteIndex === undefined ||
      this.#foreignUsed + 2 > FOREIGN_SLOT_CAPACITY
    ) {
      return undefined;
    }
    const beginSlot = this.#foreignUsed;
    const endSlot = this.#foreignUsed + 1;
    this.#foreignUsed += 2;
    return {
      kind: 'foreign',
      querySet,
      beginQuery: beginningOfPassWriteIndex,
      endQuery: endOfPassWriteIndex,
      beginSlot,
      endSlot,
    };
  }

  /**
   * Records the commands that copy query results into the readback buffer.
   * Must be called before the encoder is finished, outside of any pass.
   */
  recordResolve(encoder: GPUCommandEncoder, refs: readonly TimestampRef[]): void {
    const { querySet, resolveBuffer, readbackBuffer } = this.entry;
    if (this.#ownUsed > 0) {
      encoder.resolveQuerySet(querySet, 0, this.#ownUsed, resolveBuffer, 0);
    }
    for (const ref of refs) {
      if (ref.kind === 'foreign') {
        encoder.resolveQuerySet(
          ref.querySet,
          ref.beginQuery,
          1,
          resolveBuffer,
          OWN_BYTES + ref.beginSlot * SLOT_BYTES,
        );
        encoder.resolveQuerySet(
          ref.querySet,
          ref.endQuery,
          1,
          resolveBuffer,
          OWN_BYTES + ref.endSlot * SLOT_BYTES,
        );
      }
    }
    const usedBytes = OWN_BYTES + this.#foreignUsed * SLOT_BYTES;
    encoder.copyBufferToBuffer(resolveBuffer, 0, readbackBuffer, 0, usedBytes);
  }

  /**
   * Maps the readback buffer and returns the duration (in milliseconds) for
   * each of the given refs. Returns undefined if the readback failed.
   */
  async read(refs: readonly TimestampRef[]): Promise<(number | undefined)[] | undefined> {
    const { readbackBuffer } = this.entry;
    try {
      await readbackBuffer.mapAsync(GPUMapMode.READ);
    } catch {
      return undefined;
    }
    try {
      const data = new BigInt64Array(readbackBuffer.getMappedRange());
      return refs.map((ref) => {
        const [begin, end] =
          ref.kind === 'own'
            ? [data[ref.beginIndex], data[ref.endIndex]]
            : [
                data[(OWN_BYTES + ref.beginSlot * SLOT_BYTES) / 8],
                data[(OWN_BYTES + ref.endSlot * SLOT_BYTES) / 8],
              ];
        if (begin === undefined || end === undefined) {
          return undefined;
        }
        const ns = Number(end - begin);
        // Timestamps are not guaranteed to be monotonic across some drivers.
        return ns < 0 ? undefined : ns / 1e6;
      });
    } finally {
      readbackBuffer.unmap();
    }
  }
}
