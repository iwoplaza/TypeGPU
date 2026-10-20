import { describe, expect, vi } from 'vitest';
import { tgpu, d } from 'typegpu';
import { it } from 'typegpu-testing-utility';

function createBatchingRoot(device: GPUDevice) {
  return tgpu.initFromDevice({ device, unstable_batchSubmits: true });
}

const flushMicrotasks = () => Promise.resolve();

describe('unstable_batchSubmits', () => {
  it('submits each dispatch on its own by default', ({ root, device }) => {
    const pipeline = root.createComputePipeline({
      compute: tgpu.computeFn({ workgroupSize: [1] })(() => {}),
    });

    pipeline.dispatchWorkgroups(1);
    pipeline.dispatchWorkgroups(1);

    expect(device.queue.submit).toHaveBeenCalledTimes(2);
  });

  it('submits dispatches together after the synchronous code', async ({ device }) => {
    const root = createBatchingRoot(device as unknown as GPUDevice);
    const pipeline = root.createComputePipeline({
      compute: tgpu.computeFn({ workgroupSize: [1] })(() => {}),
    });

    pipeline.dispatchWorkgroups(1);
    pipeline.dispatchWorkgroups(1);
    expect(device.queue.submit).not.toHaveBeenCalled();

    await flushMicrotasks();
    expect(device.queue.submit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(device.queue.submit).mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('submits pending work before writing a buffer', ({ device }) => {
    const root = createBatchingRoot(device as unknown as GPUDevice);
    const pipeline = root.createComputePipeline({
      compute: tgpu.computeFn({ workgroupSize: [1] })(() => {}),
    });
    const buffer = root.createBuffer(d.u32).$usage('uniform');

    pipeline.dispatchWorkgroups(1);
    buffer.write(1);

    const submitOrder = vi.mocked(device.queue.submit).mock.invocationCallOrder[0] ?? Infinity;
    const writeOrder =
      vi.mocked(device.queue.writeBuffer).mock.invocationCallOrder.at(-1) ?? -Infinity;
    expect(submitOrder).toBeLessThan(writeOrder);
  });

  it('submits pending work before an explicit encoder', ({ device }) => {
    const root = createBatchingRoot(device as unknown as GPUDevice);
    const pipeline = root.createComputePipeline({
      compute: tgpu.computeFn({ workgroupSize: [1] })(() => {}),
    });

    pipeline.dispatchWorkgroups(1);
    const encoder = root['~unstable'].createCommandEncoder();
    pipeline.with(encoder.beginComputePass()).dispatchWorkgroups(1);
    encoder.submit();

    // The deferred dispatch first, then the explicit encoder
    expect(device.queue.submit).toHaveBeenCalledTimes(2);
  });

  it('submits pending work before destroying a buffer', ({ device }) => {
    const root = createBatchingRoot(device as unknown as GPUDevice);
    const pipeline = root.createComputePipeline({
      compute: tgpu.computeFn({ workgroupSize: [1] })(() => {}),
    });
    const buffer = root.createBuffer(d.u32).$usage('storage');
    const raw = root.unwrap(buffer);

    pipeline.dispatchWorkgroups(1);
    buffer.destroy();

    expect(vi.mocked(device.queue.submit).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(raw.destroy).mock.invocationCallOrder[0] ?? -Infinity,
    );
  });
});
