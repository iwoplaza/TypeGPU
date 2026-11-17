import { describe, expect, vi } from 'vitest';
import { d, writeToArrayBuffer } from 'typegpu';
import { it } from 'typegpu-testing-utility';

/**
 * Shared by the compiled-writer and the no-eval (fallback writer) suites, so both code paths
 * agree on what happens to elements past the end of a shorter array.
 */
export function shortArrayWriteCases() {
  describe('writing an array shorter than its schema', () => {
    it('leaves the rest of a disarray untouched', () => {
      using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const schema = d.disarrayOf(d.unorm8x4, 4);
      const buffer = new Uint8Array(d.sizeOf(schema)).fill(0xaa).buffer;

      writeToArrayBuffer(buffer, schema, [d.vec4f(0, 1, 0, 1), d.vec4f(1, 0, 1, 0)]);

      expect([...new Uint8Array(buffer)]).toStrictEqual([
        0, 255, 0, 255, 255, 0, 255, 0, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa,
      ]);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('leaves the rest of a nested array untouched', () => {
      using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const schema = d.struct({ arr: d.arrayOf(d.u32, 4) });
      const buffer = new ArrayBuffer(d.sizeOf(schema));
      writeToArrayBuffer(buffer, schema, { arr: [7, 7, 7, 7] });

      writeToArrayBuffer(buffer, schema, { arr: [1, 2] });

      expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 7, 7]);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('keeps writing the fields after a shorter nested array of vectors', () => {
      using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const schema = d.struct({ arr: d.arrayOf(d.vec2u, 3), tail: d.u32 });
      const buffer = new ArrayBuffer(d.sizeOf(schema));
      writeToArrayBuffer(buffer, schema, {
        arr: [d.vec2u(7, 7), d.vec2u(7, 7), d.vec2u(7, 7)],
        tail: 7,
      });

      writeToArrayBuffer(buffer, schema, { arr: [d.vec2u(1, 2)], tail: 3 });

      expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 7, 7, 7, 7, 3, 0]);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
}
