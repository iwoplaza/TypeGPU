import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';

describe('update statements', () => {
  it('keeps ++ and -- on integers', () => {
    const fn = () => {
      'use gpu';
      let a = d.i32(1);
      let b = d.u32(1);
      a++;
      b--;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var a = 1i;
        var b = 1u;
        a++;
        b--;
      }"
    `);
  });

  it('turns ++ and -- on f32 into compound assignments', () => {
    const fn = () => {
      'use gpu';
      let x = d.f32(0.5);
      x++;
      x--;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var x = 0.5f;
        x += 1f;
        x -= 1f;
      }"
    `);
  });

  it('turns ++ and -- on f16 into compound assignments', () => {
    const fn = () => {
      'use gpu';
      let x = d.f16(0.5);
      x++;
      x--;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var x = 0.5h;
        x += 1h;
        x -= 1h;
      }"
    `);
  });

  it('turns ++ and -- on float vector components into compound assignments', () => {
    const fn = () => {
      'use gpu';
      const v = d.vec3f();
      const h = d.vec2h();
      v.x++;
      h.y--;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var v = vec3f();
        var h = vec2h();
        v.x += 1f;
        h.y -= 1h;
      }"
    `);
  });

  it('turns ++ and -- on float array elements into compound assignments', () => {
    const fn = (i: number) => {
      'use gpu';
      const arr = [d.f32(1), 2, 3];
      arr[i]!++;
      arr[d.u32(i)]!--;
    };

    expect(tgpu.resolve([tgpu.fn([d.u32])(fn)])).toMatchInlineSnapshot(`
      "fn fn_1(i: u32) {
        var arr = array<f32, 3>(1f, 2f, 3f);
        arr[i] += 1f;
        arr[i] -= 1f;
      }"
    `);
  });
});
