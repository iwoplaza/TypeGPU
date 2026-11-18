import { d, tgpu } from 'typegpu';
import { f32 } from 'typegpu/data';
import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';

describe('TgpuGuardedComputePipeline', () => {
  it('can be named', ({ root }) => {
    const pipeline = root
      .createGuardedComputePipeline(() => {
        'use gpu';
      })
      .$name('myPipeline');

    expect(root.unwrap(pipeline.pipeline).label).toBe('myPipeline');
  });

  it('can be named after filling a bind group', ({ root }) => {
    const myBindGroupLayout = tgpu.bindGroupLayout({ a: { uniform: f32 } });
    const myBindGroup = root.createBindGroup(myBindGroupLayout, {
      a: root.createBuffer(f32).$usage('uniform'),
    });
    const pipeline = root
      .createGuardedComputePipeline(() => {
        'use gpu';
      })
      .with(myBindGroup)
      .$name('myPipeline');

    expect(root.unwrap(pipeline.pipeline).label).toBe('myPipeline');
  });

  it('delegates `withPerformanceCallback` to the underlying pipeline', ({ root }) => {
    const callback = vi.fn();
    const guarded = root.createGuardedComputePipeline(() => {
      'use gpu';
    });

    const spy = vi.spyOn(guarded.pipeline, 'withPerformanceCallback');
    guarded.withPerformanceCallback(callback);

    expect(spy).toHaveBeenCalledWith(callback);
  });

  it('rejects passes and encoders in .with()', ({ root }) => {
    const guarded = root.createGuardedComputePipeline((_x: number) => {
      'use gpu';
    });

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginComputePass();

    // @ts-expect-error guarded pipelines only accept bind groups
    expect(() => guarded.with(encoder)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Guarded pipelines only accept bind groups in .with(). To record into passes or encoders, use a regular compute pipeline.]`,
    );
    // @ts-expect-error guarded pipelines only accept bind groups
    expect(() => guarded.with(pass)).toThrow();
  });

  it('dispatches enough 1D workgroups to cover every thread', ({ root, computePassEncoder }) => {
    const pipeline = root.createGuardedComputePipeline((_x: number) => {
      'use gpu';
    });

    pipeline.dispatchThreads(1000); // 256 threads per workgroup

    expect(computePassEncoder.dispatchWorkgroups).toHaveBeenCalledExactlyOnceWith(4, 1, 1);
  });

  it('dispatches enough 2D workgroups to cover every thread', ({ root, computePassEncoder }) => {
    const pipeline = root.createGuardedComputePipeline((_x: number, _y: number) => {
      'use gpu';
    });

    pipeline.dispatchThreads(100, 3); // 16x16 threads per workgroup

    expect(computePassEncoder.dispatchWorkgroups).toHaveBeenCalledExactlyOnceWith(7, 1, 1);
  });

  it('dispatches enough 3D workgroups to cover every thread', ({ root, computePassEncoder }) => {
    const pipeline = root.createGuardedComputePipeline((_x: number, _y: number, _z: number) => {
      'use gpu';
    });

    pipeline.dispatchThreads(10, 9, 5); // 8x8x4 threads per workgroup

    expect(computePassEncoder.dispatchWorkgroups).toHaveBeenCalledExactlyOnceWith(2, 2, 2);
  });

  it('delegates `withTimestampWrites` to the underlying pipeline', ({ root }) => {
    const querySet = root.createQuerySet('timestamp', 2);
    const guarded = root.createGuardedComputePipeline(() => {
      'use gpu';
    });

    const options = {
      querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    };

    const spy = vi.spyOn(guarded.pipeline, 'withTimestampWrites');
    guarded.withTimestampWrites(options);

    expect(spy).toHaveBeenCalledWith(options);
  });

  it('restores guarded dispatch bounds after a differently sized variant', ({ root }) => {
    const layout = tgpu.bindGroupLayout({ value: { uniform: d.u32 } });
    const group = root.createBindGroup(layout, {
      value: root.createBuffer(d.u32).$usage('uniform'),
    });
    const pipeline = root.createGuardedComputePipeline((_x: number) => {
      'use gpu';
    });
    const variant = pipeline.with(group);
    using write = vi.spyOn(pipeline.sizeUniform, 'write');

    pipeline.dispatchThreads(100);
    expect(write).toHaveBeenLastCalledWith(d.vec3u(100, 1, 1));

    variant.dispatchThreads(10);
    expect(write).toHaveBeenLastCalledWith(d.vec3u(10, 1, 1));

    pipeline.dispatchThreads(100);
    expect(write).toHaveBeenLastCalledWith(d.vec3u(100, 1, 1));
  });
});
