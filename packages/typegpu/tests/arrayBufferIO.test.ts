import { describe, expect } from 'vitest';
import { d, patchArrayBuffer, readFromArrayBuffer, writeToArrayBuffer } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('arrayBufferIO', () => {
  describe('write', () => {
    it('handles d.vec input', () => {
      const buffer = new ArrayBuffer(16);

      writeToArrayBuffer(buffer, d.vec4u, d.vec4u(1, 2, 3, 4));

      expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 4]);
    });

    it('handles plain array input', () => {
      const buffer = new ArrayBuffer(16);

      writeToArrayBuffer(buffer, d.vec4u, [1, 2, 3, 4]);

      expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 4]);
    });

    it('handles typed array input', () => {
      const buffer = new ArrayBuffer(16);

      writeToArrayBuffer(buffer, d.vec4u, new Uint32Array([1, 2, 3, 4]));

      expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 4]);
    });

    it('handles ArrayBuffer input', () => {
      const buffer = new ArrayBuffer(16);

      writeToArrayBuffer(buffer, d.vec4u, new Uint32Array([1, 2, 3, 4]).buffer);

      expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 4]);
    });

    it('respects startOffset', () => {
      const buffer = new Uint32Array([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
      const Numbers = d.arrayOf(d.u32, 12);
      const layout = d.memoryLayoutOf(Numbers, (a) => a[4]);

      writeToArrayBuffer(buffer.buffer, Numbers, [1, 2, 3, 4], { startOffset: layout.offset });

      expect([...new Uint32Array(buffer)]).toStrictEqual([
        10, 10, 10, 10, 1, 2, 3, 4, 10, 10, 10, 10,
      ]);
    });

    it('handles structs', () => {
      const buffer = new ArrayBuffer(32);
      const Boid = d.struct({ pos: d.vec2u, id: d.u32 });
      const Boids = d.arrayOf(Boid, 2);

      writeToArrayBuffer(buffer, Boids, [
        Boid({ pos: d.vec2u(1, 2), id: 3 }),
        Boid({ pos: d.vec2u(4, 5), id: 6 }),
      ]);

      expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 0, 4, 5, 6, 0]);
    });

    it('handles vec3f', () => {
      const buffer = new ArrayBuffer(16);

      writeToArrayBuffer(buffer, d.vec3f, [1, 2, 3]);

      expect([...new Float32Array(buffer)]).toEqual([1, 2, 3, 0]);
    });

    it('does not override 4th element when handling vec3f', () => {
      const buffer = new ArrayBuffer(16);
      writeToArrayBuffer(buffer, d.vec4f, [1, 2, 3, 4]);

      writeToArrayBuffer(buffer, d.vec3f, [6, 7, 8]);

      expect([...new Float32Array(buffer)]).toEqual([6, 7, 8, 4]);
    });

    it('handles mat3x3f', () => {
      const buffer = new ArrayBuffer(48);

      writeToArrayBuffer(buffer, d.mat3x3f, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

      expect([...new Float32Array(buffer)]).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
    });

    it('overrides all values when handling mat3x3f', () => {
      const buffer = new ArrayBuffer(48);
      writeToArrayBuffer(
        buffer,
        d.arrayOf(d.u32, 12),
        [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
      );

      writeToArrayBuffer(buffer, d.mat3x3f, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

      expect([...new Float32Array(buffer)]).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
    });

    it('expects a particular number of elements for vectors and matrices', () => {
      const buffer = new ArrayBuffer(48);

      // @ts-expect-error
      () => writeToArrayBuffer(buffer, d.vec3f, [1, 2, 3, 4]);

      // @ts-expect-error
      () => writeToArrayBuffer(buffer, d.mat3x3f, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  describe('read', () => {
    it('handles vectors', () => {
      const buffer = new ArrayBuffer(16);
      writeToArrayBuffer(buffer, d.vec4u, d.vec4u(1, 2, 3, 4));

      const result = readFromArrayBuffer(buffer, d.vec4u);

      expect(result).toStrictEqual(d.vec4u(1, 2, 3, 4));
    });

    it('handles structs', () => {
      const buffer = new ArrayBuffer(32);
      const Boid = d.struct({ pos: d.vec2u, id: d.u32 });
      const Boids = d.arrayOf(Boid, 2);
      const boids = [Boid({ pos: d.vec2u(1, 2), id: 3 }), Boid({ pos: d.vec2u(4, 5), id: 6 })];
      writeToArrayBuffer(buffer, Boids, boids);

      const results = readFromArrayBuffer(buffer, Boids);

      expect(results).toStrictEqual(boids);
    });

    it('handles non-finite values in f32 vectors', () => {
      const buffer = new Float32Array([Infinity, -Infinity, NaN, 1]).buffer;

      expect([...readFromArrayBuffer(buffer, d.vec2f)]).toStrictEqual([Infinity, -Infinity]);
      expect([...readFromArrayBuffer(buffer, d.vec3f)]).toStrictEqual([Infinity, -Infinity, NaN]);
      expect([...readFromArrayBuffer(buffer, d.vec4f)]).toStrictEqual([
        Infinity,
        -Infinity,
        NaN,
        1,
      ]);
      expect(readFromArrayBuffer(buffer, d.vec4f).kind).toBe('vec4f');
    });

    it('handles non-finite values in f16 vectors', () => {
      // +Infinity, -Infinity, NaN, 1 as half-precision bits
      const buffer = new Uint16Array([0x7c00, 0xfc00, 0x7e00, 0x3c00]).buffer;

      expect([...readFromArrayBuffer(buffer, d.vec2h)]).toStrictEqual([Infinity, -Infinity]);
      expect([...readFromArrayBuffer(buffer, d.vec3h)]).toStrictEqual([Infinity, -Infinity, NaN]);
      expect([...readFromArrayBuffer(buffer, d.vec4h)]).toStrictEqual([
        Infinity,
        -Infinity,
        NaN,
        1,
      ]);
      expect(readFromArrayBuffer(buffer, d.vec4h).kind).toBe('vec4h');
    });

    it('handles non-finite values in matrices', () => {
      const column = (last: number) => [Infinity, -Infinity, NaN, last];
      const buffer = new Float32Array([...column(3), ...column(7), ...column(11), ...column(15)])
        .buffer;

      const m2 = readFromArrayBuffer(buffer, d.mat2x2f);
      expect(m2.columns.map((c) => [...c])).toStrictEqual([
        [Infinity, -Infinity],
        [NaN, 3],
      ]);

      // mat3x3f columns are padded to 4 elements
      const m3 = readFromArrayBuffer(buffer, d.mat3x3f);
      expect(m3.columns.map((c) => [...c])).toStrictEqual([
        [Infinity, -Infinity, NaN],
        [Infinity, -Infinity, NaN],
        [Infinity, -Infinity, NaN],
      ]);

      const m4 = readFromArrayBuffer(buffer, d.mat4x4f);
      expect(m4.columns.map((c) => [...c])).toStrictEqual([
        [Infinity, -Infinity, NaN, 3],
        [Infinity, -Infinity, NaN, 7],
        [Infinity, -Infinity, NaN, 11],
        [Infinity, -Infinity, NaN, 15],
      ]);
      expect(m4.kind).toBe('mat4x4f');
    });

    it('handles non-finite values in vectors nested in structs and arrays', () => {
      const Particle = d.struct({ pos: d.vec3f, mass: d.f32 });
      const Particles = d.arrayOf(Particle, 2);
      const buffer = new Float32Array([Infinity, 1, 2, NaN, 3, -Infinity, 4, 5]).buffer;

      const result = readFromArrayBuffer(buffer, Particles);

      expect(result.map((p) => [[...p.pos], p.mass])).toStrictEqual([
        [[Infinity, 1, 2], NaN],
        [[3, -Infinity, 4], 5],
      ]);
    });

    it('handles non-finite values in loose float vertex formats', () => {
      const buffer = new Float32Array([Infinity, -Infinity, NaN, 1]).buffer;
      const halfBuffer = new Uint16Array([0x7c00, 0xfc00, 0x7e00, 0x3c00]).buffer;

      expect([...readFromArrayBuffer(buffer, d.float32x2)]).toStrictEqual([Infinity, -Infinity]);
      expect([...readFromArrayBuffer(buffer, d.float32x3)]).toStrictEqual([
        Infinity,
        -Infinity,
        NaN,
      ]);
      expect([...readFromArrayBuffer(buffer, d.float32x4)]).toStrictEqual([
        Infinity,
        -Infinity,
        NaN,
        1,
      ]);
      expect([...readFromArrayBuffer(halfBuffer, d.float16x2)]).toStrictEqual([
        Infinity,
        -Infinity,
      ]);
      expect([...readFromArrayBuffer(halfBuffer, d.float16x4)]).toStrictEqual([
        Infinity,
        -Infinity,
        NaN,
        1,
      ]);
    });

    it('keeps vectors read with non-finite values usable', () => {
      const buffer = new Float32Array([Infinity, 1, 2, 0]).buffer;

      const result = readFromArrayBuffer(buffer, d.vec3f);

      expect([...result.yz]).toStrictEqual([1, 2]);
      expect(() => {
        result.y = Infinity;
      }).toThrow();
      expect(() => d.vec3f(Infinity)).toThrow();
    });
  });

  describe('patch', () => {
    it('works', () => {
      const buffer = new ArrayBuffer(8);
      const Struct = d.struct({ a: d.u32, b: d.u32 });
      writeToArrayBuffer(buffer, Struct, { a: 1, b: 2 });

      patchArrayBuffer(buffer, Struct, { b: 99 });

      const result = readFromArrayBuffer(buffer, Struct);
      expect(result).toStrictEqual({ a: 1, b: 99 });
    });
  });
});
