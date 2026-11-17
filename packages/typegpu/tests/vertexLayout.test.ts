import { describe, expect, it } from 'vitest';
import { tgpu, d } from 'typegpu';

describe('tgpu.vertexLayout', () => {
  it('creates attributes from loose array of vec3f', () => {
    const vertexLayout = tgpu.vertexLayout((count: number) => d.disarrayOf(d.vec3f, count));

    expect(vertexLayout.stride).toBe(12);
    expect(vertexLayout.attrib.format).toBe('float32x3');
    expect(vertexLayout.attrib.offset).toBe(0);
  });

  it('creates attributes from loose array of structs', () => {
    const VertexData = d.struct({
      a: d.u32, // +16 (12 bytes of padding)
      b: d.vec3f, // + 12
      c: d.f32, // + 4
    });

    const vertexLayout = tgpu.vertexLayout((count: number) => d.disarrayOf(VertexData, count));

    expect(vertexLayout.stride).toBe(32);
    expect(vertexLayout.attrib).toMatchObject({
      a: { format: 'uint32', offset: 0 },
      b: { format: 'float32x3', offset: 16 },
      c: { format: 'float32', offset: 28 },
    });
  });

  it('creates attributes from loose array of loose structs', () => {
    const VertexData = d.unstruct({
      a: d.u32, // +4
      b: d.vec3f, // + 12
      c: d.f32, // + 4
    });

    const vertexLayout = tgpu.vertexLayout((count: number) => d.disarrayOf(VertexData, count));

    expect(vertexLayout.stride).toBe(20);
    expect(vertexLayout.attrib).toMatchObject({
      a: { format: 'uint32', offset: 0 },
      b: { format: 'float32x3', offset: 4 },
      c: { format: 'float32', offset: 16 },
    });
  });

  it('creates attributes from loose array with f16 variants', () => {
    const vertexLayout = tgpu.vertexLayout((count: number) => d.disarrayOf(d.float16x4, count));

    expect(vertexLayout.stride).toBe(8);
    expect(vertexLayout.attrib).toMatchObject({
      format: 'float16x4',
      offset: 0,
    });
  });

  it('preserves struct-relative alignment inside an unstruct but does not align starting offset', () => {
    const Geometry = d.struct({
      position: d.vec2f,
      color: d.vec3f,
    });
    const Vertex = d.unstruct({
      tint: d.unorm8x4,
      geometry: Geometry,
    });
    const layout = tgpu.vertexLayout(d.disarrayOf(Vertex));

    expect(layout.stride).toBe(36);
    expect(layout.attrib).toMatchObject({
      tint: { format: 'unorm8x4', offset: 0 },
      geometry: {
        position: { format: 'float32x2', offset: 4 },
        color: { format: 'float32x3', offset: 20 },
      },
    });
  });

  it("aligns a nested struct to its first field's explicit alignment", () => {
    const Geometry = d.struct({
      position: d.align(16, d.vec2f),
      color: d.vec3f,
    });
    const Vertex = d.unstruct({
      tint: d.unorm8x4,
      geometry: Geometry,
    });
    const layout = tgpu.vertexLayout(d.disarrayOf(Vertex));

    expect(layout.stride).toBe(48);
    expect(layout.attrib).toMatchObject({
      tint: { format: 'unorm8x4', offset: 0 },
      geometry: {
        position: { format: 'float32x2', offset: 16 },
        color: { format: 'float32x3', offset: 32 },
      },
    });
  });

  it('throws when trying to use type that has no attribute representation', () => {
    expect(() => tgpu.vertexLayout(d.disarrayOf(d.vec3h))).toThrow();
  });

  it('throws when the stride is not a multiple of 4', () => {
    expect(() => tgpu.vertexLayout(d.disarrayOf(d.unorm8x2))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Vertex layout of unorm8x2 has a stride of 2 bytes, but WebGPU requires the stride to be a multiple of 4. Use d.size() or d.align() to pad the element type.]`,
    );
    expect(() =>
      tgpu.vertexLayout(d.disarrayOf(d.unstruct({ a: d.unorm8x2, b: d.unorm8 }).$name('Vertex'))),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Vertex layout of unstruct:Vertex has a stride of 3 bytes, but WebGPU requires the stride to be a multiple of 4. Use d.size() or d.align() to pad the element type.]`,
    );
  });

  it('throws when an attribute offset is misaligned for its format', () => {
    expect(() =>
      tgpu.vertexLayout(d.disarrayOf(d.unstruct({ a: d.unorm8, b: d.float32 }))),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Vertex attribute 'b' (float32) is at byte offset 1, but WebGPU requires attributes of this format to be placed at a multiple of 4 bytes. Use d.align() or d.size() to adjust the layout.]`,
    );
    expect(() =>
      tgpu.vertexLayout(d.disarrayOf(d.unstruct({ a: d.uint8, b: d.unorm8x2, c: d.uint8 }))),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Vertex attribute 'b' (unorm8x2) is at byte offset 1, but WebGPU requires attributes of this format to be placed at a multiple of 2 bytes. Use d.align() or d.size() to adjust the layout.]`,
    );
    expect(() =>
      tgpu.vertexLayout(
        d.disarrayOf(d.unstruct({ a: d.location(0, d.unorm8), b: d.location(1, d.f32) })),
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Vertex attribute 'b' (float32) is at byte offset 1, but WebGPU requires attributes of this format to be placed at a multiple of 4 bytes. Use d.align() or d.size() to adjust the layout.]`,
    );
  });

  it('accepts packed formats placed at valid offsets', () => {
    const single = tgpu.vertexLayout(d.disarrayOf(d.unorm8x4));
    expect(single.stride).toBe(4);
    expect(single.attrib).toMatchObject({ format: 'unorm8x4', offset: 0 });

    const packed = tgpu.vertexLayout(
      d.disarrayOf(d.unstruct({ a: d.unorm8x2, b: d.unorm8x2, c: d.float32 })),
    );
    expect(packed.stride).toBe(8);
    expect(packed.attrib).toMatchObject({
      a: { format: 'unorm8x2', offset: 0 },
      b: { format: 'unorm8x2', offset: 2 },
      c: { format: 'float32', offset: 4 },
    });

    const padded = tgpu.vertexLayout(
      d.disarrayOf(d.unstruct({ a: d.unorm8, b: d.align(4, d.float32), c: d.size(4, d.uint8) })),
    );
    expect(padded.stride).toBe(12);
    expect(padded.attrib).toMatchObject({
      a: { format: 'unorm8', offset: 0 },
      b: { format: 'float32', offset: 4 },
      c: { format: 'uint8', offset: 8 },
    });
  });
});
