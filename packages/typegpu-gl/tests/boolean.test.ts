import { tgpu, d, std } from 'typegpu';
import { glOptions } from '@typegpu/gl';
import { test } from './utils/extendedTest.ts';
import { describe, expect } from 'vitest';

describe('std.and, std.or and std.not', () => {
  test('keep logical operators on scalars', () => {
    // `std.and` and `std.or` are typed for boolean vectors, but accept scalars at runtime
    const and = std.and as unknown as (a: boolean, b: boolean) => boolean;
    const or = std.or as unknown as (a: boolean, b: boolean) => boolean;

    const fn = tgpu.fn(
      [d.bool, d.bool],
      d.bool,
    )((a, b) => {
      'use gpu';
      return std.not(and(a, or(a, b)));
    });

    expect(tgpu.resolve([fn], glOptions())).toMatchInlineSnapshot(`
      "bool fn_1(bool a, bool b) {
        return !((a && (a || b)));
      }"
    `);
  });

  test('are component-wise on vec2<bool>', () => {
    const fn = tgpu.fn(
      [d.vec2b, d.vec2b],
      d.vec2b,
    )((a, b) => {
      'use gpu';
      const x = std.and(a, b);
      const y = std.or(a, b);
      return std.and(x, std.not(y));
    });

    expect(tgpu.resolve([fn], glOptions())).toMatchInlineSnapshot(`
      "bvec2 fn_1(bvec2 a, bvec2 b) {
        bvec2 x = bvec2(uvec2(a) & uvec2(b));
        bvec2 y = bvec2(uvec2(a) | uvec2(b));
        return bvec2(uvec2(x) & uvec2(not(y)));
      }"
    `);
  });

  test('are component-wise on vec3<bool>', () => {
    const fn = tgpu.fn(
      [d.vec3b, d.vec3b],
      d.bool,
    )((a, b) => {
      'use gpu';
      return std.all(std.or(std.not(a), std.and(a, b)));
    });

    expect(tgpu.resolve([fn], glOptions())).toMatchInlineSnapshot(`
      "bool fn_1(bvec3 a, bvec3 b) {
        return all(bvec3(uvec3(not(a)) | uvec3(bvec3(uvec3(a) & uvec3(b)))));
      }"
    `);
  });

  test('are component-wise on vec4<bool>', () => {
    const fn = tgpu.fn(
      [d.vec4f, d.vec4f],
      d.vec4b,
    )((a, b) => {
      'use gpu';
      return std.or(std.lt(a, b), std.not(std.eq(a, b)));
    });

    expect(tgpu.resolve([fn], glOptions())).toMatchInlineSnapshot(`
      "bvec4 fn_1(vec4 a, vec4 b) {
        return bvec4(uvec4(lessThan(a, b)) | uvec4(not(equal(a, b))));
      }"
    `);
  });

  test('do not change the generated WGSL', () => {
    const fn = tgpu.fn(
      [d.vec2b, d.vec2b],
      d.vec2b,
    )((a, b) => {
      'use gpu';
      return std.and(std.not(a), std.or(a, b));
    });

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1(a: vec2<bool>, b: vec2<bool>) -> vec2<bool> {
        return (!(a) & (a | b));
      }"
    `);
  });
});
