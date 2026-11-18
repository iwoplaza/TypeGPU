import { describe, expect } from 'vitest';
import { d, readFromArrayBuffer, writeToArrayBuffer } from 'typegpu';
import { it } from 'typegpu-testing-utility';

/**
 * Shared by the compiled-writer and the no-eval (fallback writer) suites, so both code paths
 * are held to the same byte-level expectations.
 */
export function normalizedFormatCases() {
  describe('unorm10_10_10_2', () => {
    it('reads every 10-bit red value back, including the ones with the top bit set', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);

      for (let r = 0; r < 1024; r++) {
        view.setUint32(0, (r << 22) >>> 0, true);
        const { x } = readFromArrayBuffer(buffer, d.unorm10_10_10_2);
        expect(x, `r = ${r}`).toBe(Math.fround(r / 1023));
      }
    });

    it('reads green, blue and alpha', () => {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, ((1023 << 12) | (512 << 2) | 3) >>> 0, true);

      const { x, y, z, w } = readFromArrayBuffer(buffer, d.unorm10_10_10_2);

      expect([x, y, z, w]).toStrictEqual([0, 1, Math.fround(512 / 1023), 1]);
    });

    it('rounds instead of truncating when writing', () => {
      const buffer = new ArrayBuffer(4);

      writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(0.9, 0.5, 0.25, 0.9));

      const packed = new DataView(buffer).getUint32(0, true);
      expect([
        packed >>> 22,
        (packed >>> 12) & 1023,
        (packed >>> 2) & 1023,
        packed & 3,
      ]).toStrictEqual([
        Math.round(0.9 * 1023),
        Math.round(0.5 * 1023),
        Math.round(0.25 * 1023),
        3,
      ]);
    });

    it('round-trips every 10-bit red value', () => {
      const buffer = new ArrayBuffer(4);

      for (let r = 0; r < 1024; r++) {
        writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(r / 1023, 0, 0, 0));
        expect(readFromArrayBuffer(buffer, d.unorm10_10_10_2).x, `r = ${r}`).toBe(
          Math.fround(r / 1023),
        );
      }
    });
  });

  describe('unorm16', () => {
    it('rounds scalar, vec2 and vec4 values to the nearest integer', () => {
      // 0.5 * 65535 = 32767.5 sits exactly between two integers
      const scalar = new ArrayBuffer(2);
      writeToArrayBuffer(scalar, d.unorm16, 0.5);
      expect([...new Uint16Array(scalar)]).toStrictEqual([32768]);

      const pair = new ArrayBuffer(4);
      writeToArrayBuffer(pair, d.unorm16x2, d.vec2f(0.5, 0.25));
      expect([...new Uint16Array(pair)]).toStrictEqual([32768, Math.round(0.25 * 65535)]);

      const quad = new ArrayBuffer(8);
      writeToArrayBuffer(quad, d.unorm16x4, d.vec4f(0.5, 0.25, 0.75, 1));
      expect([...new Uint16Array(quad)]).toStrictEqual([
        32768,
        Math.round(0.25 * 65535),
        Math.round(0.75 * 65535),
        65535,
      ]);
    });

    it('clamps out-of-range values when writing', () => {
      const scalar = new ArrayBuffer(2);
      writeToArrayBuffer(scalar, d.unorm16, 1.01);
      expect([...new Uint16Array(scalar)]).toStrictEqual([65535]);
      writeToArrayBuffer(scalar, d.unorm16, -0.01);
      expect([...new Uint16Array(scalar)]).toStrictEqual([0]);

      const pair = new ArrayBuffer(4);
      writeToArrayBuffer(pair, d.unorm16x2, d.vec2f(1.01, -0.01));
      expect([...new Uint16Array(pair)]).toStrictEqual([65535, 0]);

      const quad = new ArrayBuffer(8);
      writeToArrayBuffer(quad, d.unorm16x4, d.vec4f(1.01, -0.01, 2, -1));
      expect([...new Uint16Array(quad)]).toStrictEqual([65535, 0, 65535, 0]);
    });
  });

  describe('snorm8', () => {
    it('reads the endpoints, clamping the most negative value to -1', () => {
      const buffer = new Int8Array([-128, -127, 0, 127]).buffer;

      expect(readFromArrayBuffer(buffer, d.snorm8)).toBe(-1);
      expect(readFromArrayBuffer(buffer.slice(1), d.snorm8)).toBe(-1);
      expect(readFromArrayBuffer(buffer.slice(3), d.snorm8)).toBe(1);
      expect(readFromArrayBuffer(buffer, d.snorm8x2)).toStrictEqual(d.vec2f(-1, -1));
      expect(readFromArrayBuffer(buffer, d.snorm8x4)).toStrictEqual(d.vec4f(-1, -1, 0, 1));
    });

    it('clamps out-of-range values when writing', () => {
      const scalar = new ArrayBuffer(1);
      writeToArrayBuffer(scalar, d.snorm8, 1.01);
      expect([...new Int8Array(scalar)]).toStrictEqual([127]);
      writeToArrayBuffer(scalar, d.snorm8, -1.01);
      expect([...new Int8Array(scalar)]).toStrictEqual([-127]);

      const pair = new ArrayBuffer(2);
      writeToArrayBuffer(pair, d.snorm8x2, d.vec2f(1.01, -1.01));
      expect([...new Int8Array(pair)]).toStrictEqual([127, -127]);

      const quad = new ArrayBuffer(4);
      writeToArrayBuffer(quad, d.snorm8x4, d.vec4f(1.01, -1.01, 2, -2));
      expect([...new Int8Array(quad)]).toStrictEqual([127, -127, 127, -127]);
    });
  });

  describe('snorm16', () => {
    it('reads the endpoints, clamping the most negative value to -1', () => {
      const buffer = new Int16Array([-32768, -32767, 0, 32767]).buffer;

      expect(readFromArrayBuffer(buffer, d.snorm16)).toBe(-1);
      expect(readFromArrayBuffer(buffer.slice(2), d.snorm16)).toBe(-1);
      expect(readFromArrayBuffer(buffer.slice(6), d.snorm16)).toBe(1);
      expect(readFromArrayBuffer(buffer, d.snorm16x2)).toStrictEqual(d.vec2f(-1, -1));
      expect(readFromArrayBuffer(buffer, d.snorm16x4)).toStrictEqual(d.vec4f(-1, -1, 0, 1));
    });

    it('clamps out-of-range values when writing', () => {
      const scalar = new ArrayBuffer(2);
      writeToArrayBuffer(scalar, d.snorm16, 1.01);
      expect([...new Int16Array(scalar)]).toStrictEqual([32767]);
      writeToArrayBuffer(scalar, d.snorm16, -1.01);
      expect([...new Int16Array(scalar)]).toStrictEqual([-32767]);

      const pair = new ArrayBuffer(4);
      writeToArrayBuffer(pair, d.snorm16x2, d.vec2f(1.01, -1.01));
      expect([...new Int16Array(pair)]).toStrictEqual([32767, -32767]);

      const quad = new ArrayBuffer(8);
      writeToArrayBuffer(quad, d.snorm16x4, d.vec4f(1.01, -1.01, 2, -2));
      expect([...new Int16Array(quad)]).toStrictEqual([32767, -32767, 32767, -32767]);
    });
  });

  describe('unorm8', () => {
    it('clamps out-of-range values when writing', () => {
      const scalar = new ArrayBuffer(1);
      writeToArrayBuffer(scalar, d.unorm8, 1.01);
      expect([...new Uint8Array(scalar)]).toStrictEqual([255]);
      writeToArrayBuffer(scalar, d.unorm8, -0.01);
      expect([...new Uint8Array(scalar)]).toStrictEqual([0]);

      const pair = new ArrayBuffer(2);
      writeToArrayBuffer(pair, d.unorm8x2, d.vec2f(1.01, -0.01));
      expect([...new Uint8Array(pair)]).toStrictEqual([255, 0]);

      const quad = new ArrayBuffer(4);
      writeToArrayBuffer(quad, d.unorm8x4, d.vec4f(1.01, -0.01, 2, -1));
      expect([...new Uint8Array(quad)]).toStrictEqual([255, 0, 255, 0]);
    });
  });

  describe('unorm8x4_bgra', () => {
    it('writes rounded components in b, g, r, a order', () => {
      const buffer = new ArrayBuffer(4);

      writeToArrayBuffer(buffer, d.unorm8x4_bgra, d.vec4f(0.25, 0.5, 0.75, 1));

      expect([...new Uint8Array(buffer)]).toStrictEqual([191, 128, 64, 255]);
    });

    it('clamps out-of-range values when writing', () => {
      const buffer = new ArrayBuffer(4);

      writeToArrayBuffer(buffer, d.unorm8x4_bgra, d.vec4f(1.01, -0.01, 2, -1));

      expect([...new Uint8Array(buffer)]).toStrictEqual([255, 0, 255, 0]);
    });
  });
}
