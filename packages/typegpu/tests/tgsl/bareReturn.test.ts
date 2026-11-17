import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';

describe('bare return', () => {
  it('is allowed in functions that return nothing', () => {
    const fn = tgpu.fn([d.i32])((n) => {
      'use gpu';
      if (n > 0) {
        return;
      }
    });

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1(n: i32) {
        if ((n > 0i)) {
          return;
        }
      }"
    `);
  });

  it('is rejected in functions that return a value', () => {
    const shell = tgpu.fn([d.i32], d.i32);
    // @ts-expect-error: testing invalid code
    const fn = shell((n) => {
      'use gpu';
      if (n > 0) {
        return;
      }
      return n;
    });

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>: 'return;' is invalid, the function is expected to return a value of type 'i32'.]
    `);
  });

  it('is allowed in compute functions', () => {
    const main = tgpu.computeFn({ workgroupSize: [1], in: { gid: d.builtin.globalInvocationId } })(
      ({ gid }) => {
        'use gpu';
        if (gid.x > 10) {
          return;
        }
      },
    );

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@compute @workgroup_size(1) fn main(@builtin(global_invocation_id) gid: vec3u) {
        if ((gid.x > 10u)) {
          return;
        }
      }"
    `);
  });

  it('is rejected in fragment functions with an output', () => {
    const shell = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f });
    // @ts-expect-error: testing invalid code
    const main = shell(({ uv }) => {
      'use gpu';
      if (uv.x > 0.5) {
        return;
      }
      return d.vec4f(1);
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fragmentFn:<unnamed>: 'return;' is invalid, the function is expected to return a value of type 'vec4f'.]
    `);
  });

  it('is rejected in vertex functions', () => {
    const shell = tgpu.vertexFn({
      in: { idx: d.builtin.vertexIndex },
      out: { pos: d.builtin.position },
    });
    // @ts-expect-error: testing invalid code
    const main = shell(({ idx }) => {
      'use gpu';
      if (idx > 2) {
        return;
      }
      return { pos: d.vec4f() };
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - vertexFn:<unnamed>: 'return;' is invalid, the function is expected to return a value of type '_Output'.]
    `);
  });
});
