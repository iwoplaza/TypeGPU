import { tgpu, d, std } from 'typegpu';
import { glOptions } from '@typegpu/gl';
import { test } from './utils/extendedTest.ts';
import { describe, expect } from 'vitest';

describe('matrix helpers', () => {
  test('d.mat4x4f.translation and d.mat4x4f.scaling', () => {
    const fn = tgpu.fn(
      [d.vec3f],
      d.mat4x4f,
    )((v) => {
      'use gpu';
      return d.mat4x4f.translation(v) * d.mat4x4f.scaling(v);
    });

    expect(tgpu.resolve([fn], glOptions())).toMatchInlineSnapshot(`
      "mat4 fn_1(vec3 v) {
        return (mat4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, v.x, v.y, v.z, 1) * mat4(v.x, 0, 0, 0, 0, v.y, 0, 0, 0, 0, v.z, 0, 0, 0, 0, 1));
      }"
    `);
  });

  test('d.mat4x4f.rotationX, rotationY and rotationZ', () => {
    const fn = tgpu.fn(
      [d.f32],
      d.mat4x4f,
    )((a) => {
      'use gpu';
      return d.mat4x4f.rotationX(a) * d.mat4x4f.rotationY(a) * d.mat4x4f.rotationZ(a);
    });

    expect(tgpu.resolve([fn], glOptions())).toMatchInlineSnapshot(`
      "mat4 fn_1(float a) {
        return ((mat4(1, 0, 0, 0, 0, cos(a), sin(a), 0, 0, -sin(a), cos(a), 0, 0, 0, 0, 1) * mat4(cos(a), 0, -sin(a), 0, 0, 1, 0, 0, sin(a), 0, cos(a), 0, 0, 0, 0, 1)) * mat4(cos(a), sin(a), 0, 0, -sin(a), cos(a), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
      }"
    `);
  });

  test('std.translate4, std.scale4, std.rotateX4, std.rotateY4 and std.rotateZ4', () => {
    const fn = tgpu.fn(
      [d.mat4x4f, d.vec3f, d.f32],
      d.mat4x4f,
    )((m, v, a) => {
      'use gpu';
      const translated = std.translate4(m, v);
      const scaled = std.scale4(translated, v);
      return std.rotateZ4(std.rotateY4(std.rotateX4(scaled, a), a), a);
    });

    expect(tgpu.resolve([fn], glOptions())).toMatchInlineSnapshot(`
      "mat4 fn_1(mat4 m, vec3 v, float a) {
        mat4 translated = (mat4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, v.x, v.y, v.z, 1) * m);
        mat4 scaled = (mat4(v.x, 0, 0, 0, 0, v.y, 0, 0, 0, 0, v.z, 0, 0, 0, 0, 1) * translated);
        return (mat4(cos(a), sin(a), 0, 0, -sin(a), cos(a), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * (mat4(cos(a), 0, -sin(a), 0, 0, 1, 0, 0, sin(a), 0, cos(a), 0, 0, 0, 0, 1) * (mat4(1, 0, 0, 0, 0, cos(a), sin(a), 0, 0, -sin(a), cos(a), 0, 0, 0, 0, 1) * scaled)));
      }"
    `);
  });

  test('identity matrices', () => {
    const fn = tgpu.fn([])(() => {
      'use gpu';
      const a = d.mat2x2f.identity();
      const b = d.mat3x3f.identity();
      const c = d.mat4x4f.identity();
    });

    expect(tgpu.resolve([fn], glOptions())).toMatchInlineSnapshot(`
      "void fn_1() {
        mat2 a = mat2(1, 0, 0, 1);
        mat3 b = mat3(1, 0, 0, 0, 1, 0, 0, 0, 1);
        mat4 c = mat4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
      }"
    `);
  });

  test('direct construction from scalars and column vectors', () => {
    const fn = tgpu.fn([d.f32, d.vec2f, d.vec3f, d.vec4f])((f, v2, v3, v4) => {
      'use gpu';
      const a = d.mat2x2f(f, 0, 0, f);
      const b = d.mat2x2f(v2, v2);
      const c = d.mat3x3f(f, 0, 0, 0, f, 0, 0, 0, f);
      const e = d.mat3x3f(v3, v3, v3);
      const g = d.mat4x4f(f, 0, 0, 0, 0, f, 0, 0, 0, 0, f, 0, 0, 0, 0, f);
      const h = d.mat4x4f(v4, v4, v4, v4);
    });

    expect(tgpu.resolve([fn], glOptions())).toMatchInlineSnapshot(`
      "void fn_1(float f, vec2 v2, vec3 v3, vec4 v4) {
        mat2 a = mat2(f, 0.0, 0.0, f);
        mat2 b = mat2(v2, v2);
        mat3 c = mat3(f, 0.0, 0.0, 0.0, f, 0.0, 0.0, 0.0, f);
        mat3 e = mat3(v3, v3, v3);
        mat4 g = mat4(f, 0.0, 0.0, 0.0, 0.0, f, 0.0, 0.0, 0.0, 0.0, f, 0.0, 0.0, 0.0, 0.0, f);
        mat4 h = mat4(v4, v4, v4, v4);
      }"
    `);
  });
});
