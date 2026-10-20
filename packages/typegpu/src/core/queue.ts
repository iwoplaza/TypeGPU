import { $internal } from '../shared/symbols.ts';
import type { TgpuCommandEncoder } from './commandEncoder/commandEncoder.ts';

/**
 * Each `queue.submit` costs enough to show up in per-frame JS. On devices of roots created with
 * `unstable_batchSubmits`, draws and dispatches made without an explicit encoder are submitted
 * together in a microtask, instead of one by one.
 *
 * So that the GPU still sees work in the order it was made, everything else that uses the queue,
 * maps a buffer or destroys a resource submits the pending work first: through `getQueue`
 * (the `no-raw-queue-access` lint rule enforces that), or by calling `flushPendingSubmits`.
 */
const batchingDevices = new WeakSet<GPUDevice>();
const pendingByDevice = new Map<GPUDevice, TgpuCommandEncoder[]>();

export function enableSubmitBatching(device: GPUDevice): void {
  batchingDevices.add(device);
}

/** Submits an encoder that TypeGPU created on its own, deferring it when batching is enabled */
export function submitOwnEncoder(encoder: TgpuCommandEncoder): void {
  const device = encoder[$internal].root.device;
  if (!batchingDevices.has(device)) {
    encoder.submit();
    return;
  }

  let pending = pendingByDevice.get(device);
  if (!pending) {
    pending = [];
    pendingByDevice.set(device, pending);
    queueMicrotask(() => flushPendingSubmits(device));
  }
  pending.push(encoder);
}

export function flushPendingSubmits(device: GPUDevice): void {
  const pending = pendingByDevice.get(device);
  if (!pending) {
    return;
  }
  pendingByDevice.delete(device);

  // oxlint-disable-next-line eslint-plugin-internal/no-raw-queue-access -- submitting the pending work itself
  device.queue.submit(pending.map((encoder) => encoder[$internal].finishForSubmit()));
  for (const encoder of pending) {
    encoder[$internal].runAfterSubmit();
  }
}

/** The device's queue, after submitting any work that was made before */
export function getQueue(device: GPUDevice): GPUQueue {
  flushPendingSubmits(device);
  // oxlint-disable-next-line eslint-plugin-internal/no-raw-queue-access -- the one sanctioned access
  return device.queue;
}
