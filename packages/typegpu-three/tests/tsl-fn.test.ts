import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';
// @ts-expect-error -- @types/three does not declare the WebGL fallback node builder.
import GLSLNodeBuilder from 'three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js';
import { describe, expect, it, vi } from 'vitest';
import { tgpu, d, std } from 'typegpu';
import * as t3 from '@typegpu/three';

class THREERendererMock {
  backend: { isWebGPUBackend?: boolean; isWebGLBackend?: boolean } = { isWebGPUBackend: true };

  hasFeature() {
    return false;
  }
}

function wgslBuilder() {
  const builder = new WGSLNodeBuilder();
  builder.renderer = new THREERendererMock() as unknown as THREE.Renderer;
  builder.setShaderStage('fragment');
  return builder;
}

function glslBuilder() {
  const renderer = new THREERendererMock();
  renderer.backend = { isWebGLBackend: true };
  const builder = new GLSLNodeBuilder(undefined, renderer as unknown as THREE.Renderer);
  builder.setShaderStage('fragment');
  return builder;
}

/** Runs the analyze and generate stages the way a NodeBuilder does, returning the generated snippet. */
function build(builder: THREE.NodeBuilder, node: THREE.Node): string {
  builder.setBuildStage('analyze');
  node.build(builder);
  builder.setBuildStage('generate');
  return node.build(builder) as string;
}

function flowCode(builder: THREE.NodeBuilder): string {
  return (builder as unknown as { flow: { code: string } }).flow.code;
}

describe('toTSLFn', () => {
  it('calls the resolved function with TSL arguments', () => {
    const scale = tgpu.fn(
      [d.vec2f, d.f32],
      d.vec2f,
    )((value, factor) => {
      'use gpu';
      return value.mul(factor);
    });
    const scaleTSL = t3.toTSLFn(scale);

    const builder = wgslBuilder();
    const snippet = build(builder, scaleTSL(TSL.vec2(1, 2), TSL.float(3)));

    expect(snippet).toBe('scale_tsl(vec2<f32>( 1.0, 2.0 ), 3.0)');
    expect(builder.getCodes('fragment')).toContain(
      'fn scale_tsl(value: vec2f, factor: f32) -> vec2f',
    );
  });

  it('resolves a function once for every builder that calls it', () => {
    const double = tgpu.fn(
      [d.f32],
      d.f32,
    )((value) => {
      'use gpu';
      return value * 2;
    });
    const doubleTSL = t3.toTSLFn(double);
    using resolveSpy = vi.spyOn(tgpu, 'resolveWithContext');

    for (let index = 0; index < 3; index++) {
      const builder = wgslBuilder();
      build(builder, doubleTSL(TSL.float(index)));
      expect(builder.getCodes('fragment')).toContain('fn double_tsl(value: f32) -> f32');
    }

    expect(resolveSpy).toHaveBeenCalledOnce();
  });

  it('emits a helper shared by two functions once per shader', () => {
    const shared = (value: number) => {
      'use gpu';
      return value + 1;
    };
    const first = tgpu.fn(
      [d.f32],
      d.f32,
    )((value) => {
      'use gpu';
      return shared(value);
    });
    const second = tgpu.fn(
      [d.f32],
      d.f32,
    )((value) => {
      'use gpu';
      return shared(value) * 2;
    });

    const builder = wgslBuilder();
    build(builder, TSL.add(t3.toTSLFn(first)(TSL.float(1)), t3.toTSLFn(second)(TSL.float(2))));

    const codes = builder.getCodes('fragment');
    // The namespace is global, so the helper may carry a numeric suffix from an earlier resolution.
    expect(codes.match(/fn shared(?:_\d+)?_tsl\(/g)).toHaveLength(1);
    expect(codes).toContain('fn first_tsl(');
    expect(codes).toContain('fn second_tsl(');
  });

  it('computes a reused call once', () => {
    const expensive = tgpu.fn(
      [d.f32],
      d.f32,
    )((value) => {
      'use gpu';
      return std.sqrt(value);
    });
    const call = t3.toTSLFn(expensive)(TSL.float(4));

    const builder = wgslBuilder();
    build(builder, TSL.add(call, call));

    expect(flowCode(builder).match(/expensive_tsl\(/g)).toHaveLength(1);
  });

  it('never collides with names chosen by toTSL', () => {
    const helper = (value: number) => {
      'use gpu';
      return value + 1;
    };
    const wrapped = tgpu.fn(
      [d.f32],
      d.f32,
    )((value) => {
      'use gpu';
      return helper(value);
    });
    const inline = t3.toTSL(() => {
      'use gpu';
      return helper(1);
    });

    const builder = wgslBuilder();
    build(builder, TSL.add(inline, t3.toTSLFn(wrapped)(TSL.float(1))));

    const codes = builder.getCodes('fragment');
    expect(codes).toContain('fn helper(');
    expect(codes).toContain('fn helper_tsl(');
  });

  it('declares structs before their use in GLSL', () => {
    const Pair = d.struct({ a: d.f32, b: d.f32 });
    const sumPair = tgpu.fn(
      [d.f32, d.f32],
      d.f32,
    )((a, b) => {
      'use gpu';
      const pair = Pair({ a, b });
      return pair.a + pair.b;
    });

    const builder = glslBuilder();
    const snippet = build(builder, t3.toTSLFn(sumPair)(TSL.float(1), TSL.float(2)));

    const codes = builder.getCodes('fragment') as string;
    expect(snippet).toBe('sumPair_tsl(1.0, 2.0)');
    expect(codes.indexOf('struct Pair_tsl')).toBeGreaterThanOrEqual(0);
    expect(codes.indexOf('struct Pair_tsl')).toBeLessThan(codes.indexOf('float sumPair_tsl('));
  });

  it('binds handles to each call and specializes only the declarations that read them', () => {
    const texel = t3.handle(d.texture2d(d.f32));
    const unrelated = (value: number) => {
      'use gpu';
      return value * 0.5;
    };
    const read = (coords: d.v2i) => {
      'use gpu';
      return std.textureLoad(texel.$, coords, 0).x;
    };
    const readHalf = tgpu.fn(
      [d.vec2i],
      d.f32,
    )((coords) => {
      'use gpu';
      return unrelated(read(coords));
    });
    const readHalfTSL = t3.toTSLFn(readHalf, [texel]);

    const first = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
    const second = new THREE.DataTexture(new Uint8Array([0, 255, 0, 255]), 1, 1);
    const builder = wgslBuilder();
    const snippet = build(
      builder,
      TSL.add(
        readHalfTSL(TSL.ivec2(0, 0), TSL.texture(first)),
        readHalfTSL(TSL.ivec2(0, 0), TSL.texture(second)),
      ),
    );

    const codes = builder.getCodes('fragment');
    expect(snippet).toContain('readHalf_tsl_h0(');
    expect(snippet).toContain('readHalf_tsl_h1(');
    expect(codes).toContain('textureLoad(nodeUniform0, coords, 0)');
    expect(codes).toContain('textureLoad(nodeUniform1, coords, 0)');
    expect(codes).not.toContain('t3handle');
    expect(codes.match(/fn unrelated_tsl\(/g)).toHaveLength(1);
  });

  it('rejects a call that leaves a handle unbound', () => {
    const texel = t3.handle(d.texture2d(d.f32));
    const read = tgpu.fn(
      [d.vec2i],
      d.f32,
    )((coords) => {
      'use gpu';
      return std.textureLoad(texel.$, coords, 0).x;
    });

    expect(() => build(wgslBuilder(), t3.toTSLFn(read)(TSL.ivec2(0, 0)))).toThrow(
      'reads a handle that was not passed to toTSLFn',
    );
  });

  it('checks the argument count', () => {
    const identity = tgpu.fn(
      [d.f32],
      d.f32,
    )((value) => {
      'use gpu';
      return value;
    });

    expect(() => (t3.toTSLFn(identity) as (...args: unknown[]) => unknown)()).toThrow(
      'expected 1 arguments, received 0',
    );
  });
});
