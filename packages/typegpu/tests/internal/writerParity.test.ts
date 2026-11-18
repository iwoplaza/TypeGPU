import { describe, expect } from 'vitest';
import { d, readFromArrayBuffer, setGlobalJITPreference, writeToArrayBuffer } from 'typegpu';
import { sizeOf } from 'typegpu/data';
import { it } from 'typegpu-testing-utility';
import { getCompiledWriter } from '../../src/data/compiledIO.ts';
import { type VertexFormat, vertexFormats } from '../../src/shared/vertexFormat.ts';

function writeCompiled(schema: d.AnyData, value: unknown): number[] {
  const buffer = new ArrayBuffer(sizeOf(schema));
  const writer = getCompiledWriter(schema);
  expect(writer, 'compiled writer').toBeDefined();
  writer?.(new DataView(buffer), 0, value, true, buffer.byteLength);
  return [...new Uint8Array(buffer)];
}

function writeFallback(schema: d.AnyData, value: unknown): number[] {
  const buffer = new ArrayBuffer(sizeOf(schema));
  setGlobalJITPreference('disabled');
  try {
    writeToArrayBuffer(buffer, schema, value as never);
  } finally {
    setGlobalJITPreference('auto');
  }
  return [...new Uint8Array(buffer)];
}

function expectWritersToAgree(schema: d.AnyData, value: unknown): number[] {
  const compiled = writeCompiled(schema, value);
  const fallback = writeFallback(schema, value);
  expect(fallback).toStrictEqual(compiled);
  return fallback;
}

interface Case {
  value: unknown;
  /** The little-endian bytes `value` is written as. */
  bytes?: number[];
  /** What the written bytes read back as, if not exactly `value`. */
  read?: unknown;
}

/**
 * Normalized formats include the endpoints of their range, multiples of 1/(2^n - 1) (which read
 * back exactly) and a value that has to be rounded.
 */
const vertexFormatCases: Record<VertexFormat, Case | Case[]> = {
  uint8: { value: 200, bytes: [200] },
  uint8x2: { value: d.vec2u(0, 255), bytes: [0, 255] },
  uint8x4: { value: d.vec4u(1, 2, 254, 255), bytes: [1, 2, 254, 255] },
  sint8: { value: -128, bytes: [0x80] },
  sint8x2: { value: d.vec2i(-1, 127), bytes: [0xff, 127] },
  sint8x4: { value: d.vec4i(-128, -1, 0, 127), bytes: [0x80, 0xff, 0, 127] },
  unorm8: [
    { value: 1, bytes: [255] },
    { value: 0.5, bytes: [128], read: 128 / 255 },
  ],
  unorm8x2: { value: d.vec2f(0, 64 / 255), bytes: [0, 64] },
  unorm8x4: {
    value: d.vec4f(0, 0.5, 191 / 255, 1),
    bytes: [0, 128, 191, 255],
    read: d.vec4f(0, 128 / 255, 191 / 255, 1),
  },
  snorm8: [
    { value: 1, bytes: [127] },
    { value: -1, bytes: [0x81] },
    { value: 0.5, bytes: [64], read: 64 / 127 },
  ],
  snorm8x2: { value: d.vec2f(1, -1), bytes: [127, 0x81] },
  snorm8x4: {
    value: d.vec4f(1, -1, 0, 0.5),
    bytes: [127, 0x81, 0, 64],
    read: d.vec4f(1, -1, 0, 64 / 127),
  },
  uint16: { value: 65535, bytes: [0xff, 0xff] },
  uint16x2: { value: d.vec2u(1, 256), bytes: [1, 0, 0, 1] },
  uint16x4: { value: d.vec4u(0, 1, 256, 65535), bytes: [0, 0, 1, 0, 0, 1, 0xff, 0xff] },
  sint16: { value: -32768, bytes: [0, 0x80] },
  sint16x2: { value: d.vec2i(-1, 32767), bytes: [0xff, 0xff, 0xff, 0x7f] },
  sint16x4: { value: d.vec4i(-32768, -1, 0, 256), bytes: [0, 0x80, 0xff, 0xff, 0, 0, 0, 1] },
  unorm16: [
    { value: 1, bytes: [0xff, 0xff] },
    { value: 0.5, bytes: [0, 0x80], read: 32768 / 65535 },
  ],
  unorm16x2: {
    value: d.vec2f(0.5, 1),
    bytes: [0, 0x80, 0xff, 0xff],
    read: d.vec2f(32768 / 65535, 1),
  },
  unorm16x4: {
    value: d.vec4f(0, 1, 256 / 65535, 1 / 65535),
    bytes: [0, 0, 0xff, 0xff, 0, 1, 1, 0],
  },
  snorm16: [
    { value: 1, bytes: [0xff, 0x7f] },
    { value: -1, bytes: [0x01, 0x80] },
    { value: 0.5, bytes: [0, 0x40], read: 16384 / 32767 },
  ],
  snorm16x2: { value: d.vec2f(1, -1), bytes: [0xff, 0x7f, 0x01, 0x80] },
  snorm16x4: {
    value: d.vec4f(1, -1, 0, 0.5),
    bytes: [0xff, 0x7f, 0x01, 0x80, 0, 0, 0, 0x40],
    read: d.vec4f(1, -1, 0, 16384 / 32767),
  },
  float16: { value: 1.5, bytes: [0x00, 0x3e] },
  float16x2: { value: d.vec2f(-2, 0.25), bytes: [0x00, 0xc0, 0x00, 0x34] },
  float16x4: {
    value: d.vec4f(1, -2, 0.25, 1024),
    bytes: [0x00, 0x3c, 0x00, 0xc0, 0x00, 0x34, 0x00, 0x64],
  },
  float32: { value: 1, bytes: [0, 0, 0x80, 0x3f] },
  float32x2: { value: d.vec2f(1, -2), bytes: [0, 0, 0x80, 0x3f, 0, 0, 0, 0xc0] },
  float32x3: { value: d.vec3f(0.5, 1, -2) },
  float32x4: { value: d.vec4f(0.5, 1, -2, 1024) },
  uint32: { value: 0xdeadbeef, bytes: [0xef, 0xbe, 0xad, 0xde] },
  uint32x2: { value: d.vec2u(1, 0xffffffff), bytes: [1, 0, 0, 0, 0xff, 0xff, 0xff, 0xff] },
  uint32x3: { value: d.vec3u(1, 2, 3) },
  uint32x4: { value: d.vec4u(1, 2, 3, 0xffffffff) },
  sint32: { value: -2, bytes: [0xfe, 0xff, 0xff, 0xff] },
  sint32x2: { value: d.vec2i(-1, 1), bytes: [0xff, 0xff, 0xff, 0xff, 1, 0, 0, 0] },
  sint32x3: { value: d.vec3i(-1, 0, 1) },
  sint32x4: { value: d.vec4i(-2147483648, -1, 0, 2147483647) },
  // The bit layout is left out on purpose, only that both writers agree and that it reads back.
  'unorm10-10-10-2': { value: d.vec4f(1, 512 / 1023, 256 / 1023, 1 / 3) },
  'unorm8x4-bgra': { value: d.vec4f(1, 64 / 255, 0, 1), bytes: [0, 64, 255, 255] },
};

function vertexFormatSchema(format: VertexFormat): d.AnyData {
  return (d as unknown as Record<string, d.AnyData>)[format.replaceAll('-', '_')]!;
}

describe('fallback writer parity with the compiled writer', () => {
  describe('vertex formats', () => {
    it.for(vertexFormats)('%s', (format) => {
      expect(vertexFormatCases[format], `No test case for '${format}'`).toBeDefined();
      const schema = vertexFormatSchema(format);

      for (const testCase of [vertexFormatCases[format]].flat()) {
        const bytes = expectWritersToAgree(schema, testCase.value);

        if (testCase.bytes) {
          expect(bytes).toStrictEqual(testCase.bytes);
        }
        expect(readFromArrayBuffer(new Uint8Array(bytes).buffer, schema)).toStrictEqual(
          testCase.read ?? testCase.value,
        );
      }
    });
  });

  const LooseVertex = d.unstruct({
    position: d.float32x3,
    color: d.unorm8x4,
    normal: d.snorm16x4,
    uv: d.float16x2,
    id: d.uint16,
  });

  const Padded = d.struct({ a: d.f16, b: d.vec3h, c: d.atomic(d.i32), d: d.mat3x3f });

  const schemaCases: [string, d.AnyData, unknown][] = [
    ['f16', d.f16, 1.5],
    ['i32', d.i32, -123456],
    ['vec2h', d.vec2h, d.vec2h(1.5, -2)],
    ['vec3h', d.vec3h, d.vec3h(1.5, -2, 0.25)],
    ['vec4h', d.vec4h, d.vec4h(1.5, -2, 0.25, 1024)],
    ['vec2i', d.vec2i, d.vec2i(-1, 2)],
    ['vec3i', d.vec3i, d.vec3i(-1, 2, -3)],
    ['vec4i', d.vec4i, d.vec4i(-1, 2, -3, 2147483647)],
    ['mat2x2f', d.mat2x2f, d.mat2x2f(1, 2, 3, 4)],
    ['mat3x3f', d.mat3x3f, d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9)],
    ['mat4x4f', d.mat4x4f, d.mat4x4f(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)],
    ['atomic<u32>', d.atomic(d.u32), 0xffffffff],
    ['atomic<i32>', d.atomic(d.i32), -7],
    [
      'struct with padding',
      Padded,
      Padded({
        a: 0.5,
        b: d.vec3h(1, 2, 3),
        c: -1,
        d: d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9),
      }),
    ],
    [
      'disarray of unstruct',
      d.disarrayOf(LooseVertex, 2),
      [
        LooseVertex({
          position: d.vec3f(1, 2, 3),
          color: d.vec4f(1, 0, 64 / 255, 1),
          normal: d.vec4f(0, -1, 1, 0),
          uv: d.vec2f(0.5, 0.25),
          id: 7,
        }),
        LooseVertex({
          position: d.vec3f(-1, -2, -3),
          color: d.vec4f(0, 1, 0, 0),
          normal: d.vec4f(1, 0, 0, -1),
          uv: d.vec2f(-0.5, 2),
          id: 65535,
        }),
      ],
    ],
  ];

  describe('schemas', () => {
    it.for(schemaCases)('%s', ([, schema, value]) => {
      const bytes = expectWritersToAgree(schema, value);

      expect(readFromArrayBuffer(new Uint8Array(bytes).buffer, schema)).toStrictEqual(value);
    });
  });
});
