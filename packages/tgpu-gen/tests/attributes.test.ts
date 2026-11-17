import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { generate } from '../gen.mjs';

function typeCheck(code: string) {
  const fileName = path.join(import.meta.dirname, '__generated__.ts');
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    lib: ['lib.es2024.d.ts', 'lib.dom.d.ts'],
    types: ['@webgpu/types'],
  };
  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (name, ...rest) =>
    name === fileName
      ? ts.createSourceFile(name, code, ts.ScriptTarget.ESNext)
      : getSourceFile(name, ...rest);
  host.fileExists = (name) => name === fileName || fileExists(name);
  host.readFile = (name) => (name === fileName ? code : readFile(name));

  const program = ts.createProgram([fileName], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

const wgsl = `
struct VertexOutput {
  @builtin(position) @invariant pos: vec4f,
  @builtin(front_facing) frontFacing: bool,
  @location(0) @interpolate(flat) id: u32,
  @location(1) @interpolate(linear, sample) uv: vec2f,
  @location(2) color: vec4f,
};

struct Foo {
  a: mat2x2f,
  b: mat3x3<f32>,
  c: mat4x4f,
};

const FOO = 3u;
override BAR: f32 = 1.0;
var<workgroup> tile: array<f32, 64>;
var<private> seed: u32;
@group(0) @binding(0) var<uniform> u: Foo;`;

it('generates code that type-checks against typegpu', { timeout: 30_000 }, () => {
  expect(typeCheck(generate(wgsl))).toStrictEqual([]);
});

describe('struct member attributes', () => {
  it('generates builtin, interpolate and invariant attributes', () => {
    const expected = `\
export const VertexOutput = d.struct({
  pos: d.invariant(d.builtin.position),
  frontFacing: d.builtin.frontFacing,
  id: d.interpolate('flat', d.location(0, d.u32)),
  uv: d.interpolate('linear, sample', d.location(1, d.vec2f)),
  color: d.location(2, d.vec4f),
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('throws on unknown builtins', () => {
    const wgsl = `
struct Foo {
  @builtin(not_a_builtin) a: u32,
};`;

    expect(() => generate(wgsl)).toThrow(/not_a_builtin.*member 'a' of struct 'Foo'/);
  });
});

describe('unsupported types', () => {
  it.each(['mat3x4<f32>', 'mat2x3f', 'mat2x2<f16>', 'mat4x4h'])(
    'throws on %s, naming the type and where it occurs',
    (type) => {
      const wgsl = `
struct Foo {
  a: f32,
  b: ${type},
};`;

      expect(() => generate(wgsl)).toThrow(`Unsupported data type: ${type}`);
      expect(() => generate(wgsl)).toThrow(`member 'b' of struct 'Foo'`);
    },
  );

  it('names the alias an unsupported type occurs in', () => {
    expect(() => generate('alias Foo = array<mat3x2f, 4>;')).toThrow(
      `Unsupported data type: mat3x2f (in alias 'Foo')`,
    );
  });

  it('names the binding an unsupported type occurs in', () => {
    expect(() => generate('@group(0) @binding(0) var<uniform> foo: mat2x4f;')).toThrow(
      `Unsupported data type: mat2x4f (in binding 'foo')`,
    );
  });

  it('names the function an unsupported type occurs in', () => {
    expect(() => generate('fn foo(m: mat4x2f) -> f32 { return 1.0; }')).toThrow(
      `Unsupported data type: mat4x2f (in function 'foo')`,
    );
  });

  it('keeps generating supported matrices', () => {
    expect(generate(wgsl)).toContain(`\
export const Foo = d.struct({
  a: d.mat2x2f,
  b: d.mat3x3f,
  c: d.mat4x4f,
});`);
  });
});

describe('skipped declarations', () => {
  it('lists module-scope declarations that are not generated', () => {
    expect(generate(wgsl)).toContain(`\
/* skipped declarations (not supported by tgpu-gen) */
// const FOO
// override BAR
// var<workgroup> tile
// var<private> seed`);
  });

  it('does not add the comment when nothing is skipped', () => {
    expect(generate('@group(0) @binding(0) var<uniform> u: vec4f;')).not.toContain('skipped');
  });
});
