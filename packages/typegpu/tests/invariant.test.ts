import { describe, expect, expectTypeOf } from 'vitest';
import { tgpu, d, type TgpuRenderPipeline, type TgpuVertexFn } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('invariant', () => {
  it('adds @invariant attribute to position builtin', () => {
    const s1 = d.struct({
      position: d.invariant(d.builtin.position),
    });

    expect(tgpu.resolve([s1])).toContain('@invariant @builtin(position) position: vec4f');
  });

  it('throws error when applied to non-position builtin', () => {
    expect(() => {
      // @ts-expect-error - Testing error case with invalid builtin
      d.invariant(d.builtin.vertexIndex);
    }).toThrow('The @invariant attribute must only be applied to the position built-in value.');
  });

  it('throws error when applied to non-builtin data', () => {
    expect(() => {
      // @ts-expect-error - Testing error case with non-builtin data
      d.invariant(d.f32);
    }).toThrow('The @invariant attribute must only be applied to the position built-in value.');
  });

  it('can be used in vertex shader output', () => {
    const VertexOutput = d.struct({
      pos: d.invariant(d.builtin.position),
      color: d.vec4f,
    });

    const resolved = tgpu.resolve([VertexOutput]);

    expect(resolved).toContain('@invariant @builtin(position) pos: vec4f');
    expect(resolved).toContain('color: vec4f');
  });

  it('can be used in a vertex function shell output', () => {
    const main = tgpu.vertexFn({
      out: { pos: d.invariant(d.builtin.position), uv: d.vec2f },
    })(() => {
      'use gpu';
      return { pos: d.vec4f(), uv: d.vec2f() };
    });

    expectTypeOf(main).toEqualTypeOf<TgpuVertexFn<{}, { uv: d.Vec2f }>>();
    expect(tgpu.resolve([main])).toContain('@invariant @builtin(position) pos: vec4f');
  });

  it('is not treated as a varying by render pipelines', ({ root }) => {
    const vertex = tgpu.vertexFn({
      out: { pos: d.invariant(d.builtin.position), uv: d.vec2f },
    })(() => {
      'use gpu';
      return { pos: d.vec4f(), uv: d.vec2f() };
    });

    const fragment = tgpu.fragmentFn({
      in: { uv: d.vec2f },
      out: d.vec4f,
    })(({ uv }) => {
      'use gpu';
      return d.vec4f(uv, 0, 1);
    });

    const pipeline = root.createRenderPipeline({
      vertex,
      fragment,
      targets: { format: 'rgba8unorm' },
    });

    expectTypeOf(pipeline).toEqualTypeOf<TgpuRenderPipeline<d.Vec4f>>();
    expect(tgpu.resolve([pipeline])).toContain('@invariant @builtin(position) pos: vec4f');
  });
});
