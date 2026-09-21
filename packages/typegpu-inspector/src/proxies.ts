import type { EncoderRecord } from './encoder.ts';
import type { PassRecord } from './types.ts';

type AnyFn = (...args: never[]) => unknown;

/**
 * Wraps a native WebGPU object in a Proxy, so that selected methods can be
 * observed while everything else is forwarded untouched. Native methods are
 * bound to the original object, since they refuse to run with a Proxy as
 * `this`.
 */
function proxyWithOverrides<T extends object>(target: T, overrides: Record<string, AnyFn>): T {
  return new Proxy(target, {
    get(obj, prop) {
      if (typeof prop === 'string' && Object.hasOwn(overrides, prop)) {
        return overrides[prop];
      }
      const value = Reflect.get(obj, prop, obj);
      return typeof value === 'function' ? (value as AnyFn).bind(obj) : value;
    },
    set(obj, prop, value) {
      return Reflect.set(obj, prop, value, obj);
    },
  });
}

function labelOf(pipeline: { label: string } | undefined): string | undefined {
  return pipeline?.label || undefined;
}

export function createRenderPassProxy(
  raw: GPURenderPassEncoder,
  record: EncoderRecord,
  pass: PassRecord,
): GPURenderPassEncoder {
  let pipeline: GPURenderPipeline | undefined;

  const overrides: Record<string, AnyFn> = {
    setPipeline(p: GPURenderPipeline) {
      pipeline = p;
      record.onSetPipeline(pass, p);
      return raw.setPipeline(p);
    },
    setBindGroup(index: number, bindGroup: GPUBindGroup | null, ...rest: unknown[]) {
      record.onSetBindGroup(pass, index, bindGroup);
      return (raw.setBindGroup as AnyFn)(...([index, bindGroup, ...rest] as unknown as never[]));
    },
    setVertexBuffer(slot: number, buffer: GPUBuffer | null, offset?: number, size?: number) {
      record.onSetVertexBuffer(pass, slot, buffer);
      return raw.setVertexBuffer(slot, buffer, offset, size);
    },
    setIndexBuffer(buffer: GPUBuffer, format: GPUIndexFormat, offset?: number, size?: number) {
      record.onSetIndexBuffer(pass, buffer);
      return raw.setIndexBuffer(buffer, format, offset, size);
    },
    draw(
      vertexCount: number,
      instanceCount?: number,
      firstVertex?: number,
      firstInstance?: number,
    ) {
      record.onCall(pass, {
        kind: 'draw',
        pipeline: labelOf(pipeline),
        args: [vertexCount, instanceCount ?? 1],
      });
      return raw.draw(vertexCount, instanceCount, firstVertex, firstInstance);
    },
    drawIndexed(
      indexCount: number,
      instanceCount?: number,
      firstIndex?: number,
      baseVertex?: number,
      firstInstance?: number,
    ) {
      record.onCall(pass, {
        kind: 'drawIndexed',
        pipeline: labelOf(pipeline),
        args: [indexCount, instanceCount ?? 1],
      });
      return raw.drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance);
    },
    drawIndirect(indirectBuffer: GPUBuffer, indirectOffset: number) {
      record.onIndirectBuffer(pass, indirectBuffer);
      record.onCall(pass, { kind: 'drawIndirect', pipeline: labelOf(pipeline), args: [] });
      return raw.drawIndirect(indirectBuffer, indirectOffset);
    },
    drawIndexedIndirect(indirectBuffer: GPUBuffer, indirectOffset: number) {
      record.onIndirectBuffer(pass, indirectBuffer);
      record.onCall(pass, { kind: 'drawIndexedIndirect', pipeline: labelOf(pipeline), args: [] });
      return raw.drawIndexedIndirect(indirectBuffer, indirectOffset);
    },
    executeBundles(bundles: Iterable<GPURenderBundle>) {
      const list = Array.from(bundles);
      record.onCall(pass, { kind: 'executeBundles', pipeline: undefined, args: [list.length] });
      return raw.executeBundles(list);
    },
    end() {
      raw.end();
      record.afterPassEnd(pass);
    },
  };

  return proxyWithOverrides(raw, overrides);
}

export function createComputePassProxy(
  raw: GPUComputePassEncoder,
  record: EncoderRecord,
  pass: PassRecord,
): GPUComputePassEncoder {
  let pipeline: GPUComputePipeline | undefined;

  const overrides: Record<string, AnyFn> = {
    setPipeline(p: GPUComputePipeline) {
      pipeline = p;
      record.onSetPipeline(pass, p);
      return raw.setPipeline(p);
    },
    setBindGroup(index: number, bindGroup: GPUBindGroup | null, ...rest: unknown[]) {
      record.onSetBindGroup(pass, index, bindGroup);
      return (raw.setBindGroup as AnyFn)(...([index, bindGroup, ...rest] as unknown as never[]));
    },
    dispatchWorkgroups(x: number, y?: number, z?: number) {
      record.onCall(pass, {
        kind: 'dispatchWorkgroups',
        pipeline: labelOf(pipeline),
        args: [x, y ?? 1, z ?? 1],
      });
      return raw.dispatchWorkgroups(x, y, z);
    },
    dispatchWorkgroupsIndirect(indirectBuffer: GPUBuffer, indirectOffset: number) {
      record.onIndirectBuffer(pass, indirectBuffer);
      record.onCall(pass, {
        kind: 'dispatchWorkgroupsIndirect',
        pipeline: labelOf(pipeline),
        args: [],
      });
      return raw.dispatchWorkgroupsIndirect(indirectBuffer, indirectOffset);
    },
    end() {
      raw.end();
      record.afterPassEnd(pass);
    },
  };

  return proxyWithOverrides(raw, overrides);
}

export function createCommandEncoderProxy(
  raw: GPUCommandEncoder,
  record: EncoderRecord,
): GPUCommandEncoder {
  const overrides: Record<string, AnyFn> = {
    beginRenderPass(descriptor: GPURenderPassDescriptor) {
      const { descriptor: patched, pass } = record.beginRenderPass(descriptor);
      return createRenderPassProxy(raw.beginRenderPass(patched), record, pass);
    },
    beginComputePass(descriptor?: GPUComputePassDescriptor) {
      const { descriptor: patched, pass } = record.beginComputePass(descriptor);
      return createComputePassProxy(raw.beginComputePass(patched), record, pass);
    },
    copyBufferToBuffer(...args: unknown[]) {
      // Both the (src, srcOffset, dst, dstOffset, size) and the newer
      // (src, dst, size?) overloads are supported.
      const source = args[0] as GPUBuffer;
      const destination = (typeof args[1] === 'number' ? args[2] : args[1]) as GPUBuffer;
      record.recordCopy('copyBufferToBuffer', [{ buffer: source }], [{ buffer: destination }]);
      return (raw.copyBufferToBuffer as AnyFn)(...(args as never[]));
    },
    copyBufferToTexture(
      source: GPUTexelCopyBufferInfo,
      destination: GPUTexelCopyTextureInfo,
      copySize: GPUExtent3DStrict,
    ) {
      record.recordCopy(
        'copyBufferToTexture',
        [{ buffer: source.buffer }],
        [{ texture: destination.texture }],
      );
      return raw.copyBufferToTexture(source, destination, copySize);
    },
    copyTextureToBuffer(
      source: GPUTexelCopyTextureInfo,
      destination: GPUTexelCopyBufferInfo,
      copySize: GPUExtent3DStrict,
    ) {
      record.recordCopy(
        'copyTextureToBuffer',
        [{ texture: source.texture }],
        [{ buffer: destination.buffer }],
      );
      return raw.copyTextureToBuffer(source, destination, copySize);
    },
    copyTextureToTexture(
      source: GPUTexelCopyTextureInfo,
      destination: GPUTexelCopyTextureInfo,
      copySize: GPUExtent3DStrict,
    ) {
      record.recordCopy(
        'copyTextureToTexture',
        [{ texture: source.texture }],
        [{ texture: destination.texture }],
      );
      return raw.copyTextureToTexture(source, destination, copySize);
    },
    clearBuffer(buffer: GPUBuffer, offset?: number, size?: number) {
      record.recordCopy('clearBuffer', [], [{ buffer }]);
      return raw.clearBuffer(buffer, offset, size);
    },
    finish(descriptor?: GPUCommandBufferDescriptor) {
      record.beforeFinish();
      const commandBuffer = raw.finish(descriptor);
      record.session.registerCommandBuffer(commandBuffer, record);
      return commandBuffer;
    },
  };

  return proxyWithOverrides(raw, overrides);
}
