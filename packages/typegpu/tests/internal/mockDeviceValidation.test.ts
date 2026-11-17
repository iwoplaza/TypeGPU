import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';

describe('mock GPUDevice buffer validation', () => {
  describe('createBuffer', () => {
    it('accepts valid descriptors', ({ device }) => {
      expect(() => {
        device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
        });
        device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE, mappedAtCreation: true });
      }).not.toThrow();
    });

    it('rejects a usage of 0', ({ device }) => {
      expect(() => device.createBuffer({ size: 16, usage: 0 })).toThrowErrorMatchingInlineSnapshot(
        `[MockValidationError: [typegpu-testing-utility mock] createBuffer(): usage must not be 0]`,
      );
    });

    it('rejects MAP_READ combined with anything but COPY_DST', ({ device }) => {
      expect(() =>
        device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.STORAGE }),
      ).toThrow(/MAP_READ can only be combined with COPY_DST/);
      expect(() =>
        device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.MAP_WRITE,
        }),
      ).toThrow(/MAP_READ can only be combined with COPY_DST/);
    });

    it('rejects MAP_WRITE combined with anything but COPY_SRC', ({ device }) => {
      expect(() =>
        device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_DST,
        }),
      ).toThrow(/MAP_WRITE can only be combined with COPY_SRC/);
    });

    it('rejects mappedAtCreation with a size that is not a multiple of 4', ({ device }) => {
      expect(() =>
        device.createBuffer({ size: 6, usage: GPUBufferUsage.STORAGE, mappedAtCreation: true }),
      ).toThrow(/mappedAtCreation requires size \(6\) to be a multiple of 4/);
    });
  });

  describe('writeBuffer', () => {
    it('accepts valid writes and still records calls', ({ device }) => {
      const buffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const data = new Float32Array([1, 2, 3, 4]);

      device.queue.writeBuffer(buffer, 0, data);
      device.queue.writeBuffer(buffer, 8, data, 2);
      device.queue.writeBuffer(buffer, 4, data.buffer, 4, 8);

      expect(device.mock.queue.writeBuffer).toHaveBeenCalledTimes(3);
      expect(device.mock.queue.writeBuffer).toHaveBeenNthCalledWith(1, buffer, 0, data);
    });

    it('rejects buffers without COPY_DST', ({ device }) => {
      const buffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM });
      expect(() => device.queue.writeBuffer(buffer, 0, new Float32Array(4))).toThrow(
        /must include COPY_DST/,
      );
    });

    it('rejects unaligned offsets and sizes', ({ device }) => {
      const buffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST });
      expect(() => device.queue.writeBuffer(buffer, 2, new Float32Array(1))).toThrow(
        /bufferOffset \(2\) must be a multiple of 4/,
      );
      expect(() => device.queue.writeBuffer(buffer, 0, new Uint8Array(3))).toThrow(
        /written byte size \(3\) must be a multiple of 4/,
      );
      expect(() => device.queue.writeBuffer(buffer, 0, new Uint16Array(4), 0, 1)).toThrow(
        /written byte size \(2\) must be a multiple of 4/,
      );
    });

    it('rejects writes past the end of the buffer', ({ device }) => {
      const buffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST });
      expect(() => device.queue.writeBuffer(buffer, 8, new Float32Array(4))).toThrow(
        /write of 16 bytes at offset 8 exceeds buffer size \(16\)/,
      );
    });

    it('rejects ranges outside of the source data', ({ device }) => {
      const buffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.COPY_DST });
      expect(() => device.queue.writeBuffer(buffer, 0, new Float32Array(4), 2, 4)).toThrow(
        /out of bounds of data/,
      );
      expect(() => device.queue.writeBuffer(buffer, 0, new Float32Array(4), 8)).toThrow(
        /out of bounds of data/,
      );
    });

    it('rejects destroyed and mapped buffers', ({ device }) => {
      const destroyed = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST });
      destroyed.destroy();
      expect(() => device.queue.writeBuffer(destroyed, 0, new Float32Array(4))).toThrow(
        /buffer is destroyed/,
      );

      const mapped = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      expect(() => device.queue.writeBuffer(mapped, 0, new Float32Array(4))).toThrow(
        /buffer must be unmapped/,
      );
      mapped.unmap();
      expect(() => device.queue.writeBuffer(mapped, 0, new Float32Array(4))).not.toThrow();
    });
  });

  describe('mapAsync', () => {
    it('requires the mode to match the usage', async ({ device }) => {
      const readable = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      expect(() => readable.mapAsync(GPUMapMode.WRITE)).toThrow(/WRITE requires MAP_WRITE/);
      expect(() => readable.mapAsync(GPUMapMode.READ | GPUMapMode.WRITE)).toThrow(
        /must be exactly one of READ or WRITE/,
      );
      await readable.mapAsync(GPUMapMode.READ);
      expect(readable.mapState).toBe('mapped');

      const storage = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
      expect(() => storage.mapAsync(GPUMapMode.READ)).toThrow(/READ requires MAP_READ/);
    });

    it('rejects already mapped and destroyed buffers', async ({ device }) => {
      const buffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      await buffer.mapAsync(GPUMapMode.READ);
      expect(() => buffer.mapAsync(GPUMapMode.READ)).toThrow(/buffer must be unmapped/);

      buffer.destroy();
      expect(buffer.mapState).toBe('unmapped');
      expect(() => buffer.mapAsync(GPUMapMode.READ)).toThrow(/buffer is destroyed/);
    });

    it('rejects invalid ranges', ({ device }) => {
      const buffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      expect(() => buffer.mapAsync(GPUMapMode.READ, 4)).toThrow(/invalid range/);
      expect(() => buffer.mapAsync(GPUMapMode.READ, 0, 32)).toThrow(/invalid range/);
    });
  });

  describe('getMappedRange', () => {
    it('requires the buffer to be mapped', async ({ device }) => {
      const buffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      expect(() => buffer.getMappedRange()).toThrow(/buffer is not mapped/);

      await buffer.mapAsync(GPUMapMode.READ, 0, 8);
      expect(() => buffer.getMappedRange(0, 8)).not.toThrow();
      expect(() => buffer.getMappedRange(0, 16)).toThrow(/outside the mapped range/);

      buffer.unmap();
      expect(() => buffer.getMappedRange()).toThrow(/buffer is not mapped/);
    });
  });
});
