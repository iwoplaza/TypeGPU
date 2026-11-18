import { describe, expect, it } from 'vitest';
import { tgpu, d } from 'typegpu';

describe('float to integer conversion', () => {
  describe('in vector constructors', () => {
    it('clamps f32 vector components to the u32 range', () => {
      expect(d.vec2u(d.vec2f(-1, 1e20))).toStrictEqual(d.vec2u(0, 4294967040));
      expect(d.vec3u(d.vec3f(3.9, -0.5, 4294967040))).toStrictEqual(d.vec3u(3, 0, 4294967040));
      expect(d.vec4u(d.vec4f(-1e20, 1, 2, 3))).toStrictEqual(d.vec4u(0, 1, 2, 3));
    });

    it('clamps f32 vector components to the i32 range', () => {
      expect(d.vec2i(d.vec2f(1e20, -1e20))).toStrictEqual(d.vec2i(2147483520, -2147483648));
      expect(d.vec3i(d.vec3f(-3.9, 3.9, 3e10))).toStrictEqual(d.vec3i(-3, 3, 2147483520));
      expect(d.vec4i(d.vec4f(2147483520, -2147483648, 0, -0.5))).toStrictEqual(
        d.vec4i(2147483520, -2147483648, 0, 0),
      );
    });

    it('converts f16 vector components', () => {
      expect(d.vec2u(d.vec2h(-1, 65504))).toStrictEqual(d.vec2u(0, 65504));
      expect(d.vec2i(d.vec2h(-65504, 1.5))).toStrictEqual(d.vec2i(-65504, 1));
    });

    it('keeps wrapping plain numbers and integer vectors', () => {
      expect(d.vec2u(-1, -2)).toStrictEqual(d.vec2u(4294967295, 4294967294));
      expect(d.vec2u(d.vec2i(-1, -2))).toStrictEqual(d.vec2u(4294967295, 4294967294));
      expect(d.vec2i(d.vec2u(4294967295, 2147483648))).toStrictEqual(d.vec2i(-1, -2147483648));
      expect(d.vec2i(2147483648)).toStrictEqual(d.vec2i(-2147483648));
    });

    it('does not touch float to float conversions', () => {
      expect(d.vec2f(d.vec2h(-1, 1.5))).toStrictEqual(d.vec2f(-1, 1.5));
      expect(d.vec2f(d.vec2u(4294967295, 0))).toStrictEqual(d.vec2f(4294967296, 0));
    });
  });

  describe('when folded at compile time', () => {
    it('clamps f32 to u32', () => {
      const main = () => {
        'use gpu';
        const a = d.u32(d.f32(-1));
        const b = d.u32(d.f32(1e20));
        const c = d.u32(d.f32(3.9));
        const e = d.u32(d.f32(-3.9));
      };

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() {
          const a = 0u;
          const b = 4294967040u;
          const c = 3u;
          const e = 0u;
        }"
      `);
    });

    it('clamps f32 to i32', () => {
      const main = () => {
        'use gpu';
        const a = d.i32(d.f32(3e10));
        const b = d.i32(d.f32(-1e20));
        const c = d.i32(d.f32(-3.9));
      };

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() {
          const a = 2147483520i;
          const b = i32(-2147483648);
          const c = -3i;
        }"
      `);
    });

    it('clamps f16 to integers', () => {
      const main = () => {
        'use gpu';
        const a = d.u32(d.f16(-1));
        const b = d.i32(d.f16(-65504));
      };

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() {
          const a = 0u;
          const b = -65504i;
        }"
      `);
    });

    it('clamps abstract floats to the full integer range', () => {
      const main = () => {
        'use gpu';
        const a = d.i32(30000000000.5);
        const b = d.i32(-30000000000.5);
        const c = d.u32(4294967295.5);
        const e = d.u32(-1.5);
      };

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() {
          const a = 2147483647i;
          const b = i32(-2147483648);
          const c = 4294967295u;
          const e = 0u;
        }"
      `);
    });

    it('clamps f32 vectors', () => {
      const main = () => {
        'use gpu';
        const a = d.vec2u(d.vec2f(-1, -2));
        const b = d.vec2i(d.vec2f(1e20, -1e20));
        const c = d.vec2u(d.f32(-1), 2);
      };

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() {
          let a = vec2u();
          let b = vec2i(2147483520, -2147483648);
          let c = vec2u(0, 2);
        }"
      `);
    });

    it('keeps wrapping integers', () => {
      const main = () => {
        'use gpu';
        const a = d.u32(d.i32(-1));
        const b = d.i32(d.u32(4294967295));
        const c = d.vec2u(d.vec2i(-1, -2));
      };

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() {
          const a = 4294967295u;
          const b = -1i;
          let c = vec2u(4294967295, 4294967294);
        }"
      `);
    });
  });
});
