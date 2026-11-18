import { describe, expect, it } from 'vitest';
import { createOutputPathCompiler } from '../outputPathCompiler.mjs';

const test = ({
  inputPattern,
  outputPattern,
  fileName,
  expected,
}: {
  inputPattern?: string;
  outputPattern: string;
  fileName: string;
  expected: string;
}) =>
  expect(
    createOutputPathCompiler(inputPattern ?? '**/*.wgsl', outputPattern)(fileName),
  ).toStrictEqual(expected);

describe('createOutputPathCompiler', () => {
  it('generates an output path that is the same as output pattern when no placeholders are used', () => {
    test({
      outputPattern: 'hello.ts',
      fileName: 'hello.wgsl',
      expected: 'hello.ts',
    });
  });

  it('generates output paths in the same directories as the source files when no directory separator is present in the output pattern', () => {
    test({
      outputPattern: '*.ts',
      fileName: 'hello.wgsl',
      expected: 'hello.ts',
    });

    test({
      outputPattern: '*.js',
      fileName: 'hello.wgsl',
      expected: 'hello.js',
    });

    test({
      outputPattern: '*.ts',
      fileName: 'test/hello.wgsl',
      expected: 'test/hello.ts',
    });

    test({
      outputPattern: '*.ts',
      fileName: 'test/test2/hello.wgsl',
      expected: 'test/test2/hello.ts',
    });
  });

  it('generates output paths, flattening all outputs to a single specified directory when no ** placeholder is used', () => {
    test({
      outputPattern: 'generated/*.ts',
      fileName: 'hello.wgsl',
      expected: 'generated/hello.ts',
    });

    test({
      outputPattern: 'generated/generated2/*.ts',
      fileName: 'hello.wgsl',
      expected: 'generated/generated2/hello.ts',
    });

    test({
      outputPattern: 'generated/*.ts',
      fileName: 'test/hello.wgsl',
      expected: 'generated/hello.ts',
    });

    test({
      outputPattern: 'generated/*.ts',
      fileName: 'test/test2/hello.wgsl',
      expected: 'generated/hello.ts',
    });
  });

  it('generates output paths keeping the directory structure when ** placeholder is used', () => {
    test({
      outputPattern: 'generated/**/*.ts',
      fileName: 'hello.wgsl',
      expected: 'generated/hello.ts',
    });

    test({
      outputPattern: 'generated/**/*.ts',
      fileName: 'test/hello.wgsl',
      expected: 'generated/test/hello.ts',
    });

    test({
      outputPattern: 'generated/**/*.ts',
      fileName: 'test/test2/hello.wgsl',
      expected: 'generated/test/test2/hello.ts',
    });

    test({
      outputPattern: 'generated/**/files/*.ts',
      fileName: 'test/test2/hello.wgsl',
      expected: 'generated/test/test2/files/hello.ts',
    });

    test({
      outputPattern: 'generated/**/*_1.ts',
      fileName: 'test/test2/hello.wgsl',
      expected: 'generated/test/test2/hello_1.ts',
    });

    test({
      inputPattern: 'test/**/*.wgsl',
      outputPattern: 'generated/**/*.ts',
      fileName: 'test/test2/hello.wgsl',
      expected: 'generated/test2/hello.ts',
    });

    test({
      inputPattern: 'test/**/test3/*.wgsl',
      outputPattern: 'generated/**/*.ts',
      fileName: 'test/test2/test3/hello.wgsl',
      expected: 'generated/test2/hello.ts',
    });

    test({
      inputPattern: 'test/**/test3/*.wgsl',
      outputPattern: 'generated/**/gen/*.ts',
      fileName: 'test/test1/test2/test3/hello.wgsl',
      expected: 'generated/test1/test2/gen/hello.ts',
    });

    test({
      inputPattern: '**/wgsl/*.wgsl',
      outputPattern: '**/ts/*.ts',
      fileName: 'test/wgsl/hello.wgsl',
      expected: 'test/ts/hello.ts',
    });

    test({
      inputPattern: '**/test3/*.wgsl',
      outputPattern: '**/gen/gen2/*.ts',
      fileName: 'test/test1/test2/test3/hello.wgsl',
      expected: 'test/test1/test2/gen/gen2/hello.ts',
    });

    test({
      inputPattern: 'src/**/*.wgsl',
      outputPattern: 'output/**/*.ts',
      fileName: 'src/shader1.wgsl',
      expected: 'output/shader1.ts',
    });

    test({
      inputPattern: 'src/**/*.wgsl',
      outputPattern: 'output/**/*.ts',
      fileName: 'src/examples/shader1.wgsl',
      expected: 'output/examples/shader1.ts',
    });
  });

  it('treats regex special characters in the input pattern as literal path characters', () => {
    test({
      inputPattern: 'shaders (old)/**/*.wgsl',
      outputPattern: 'generated/**/*.ts',
      fileName: 'shaders (old)/nested/hello.wgsl',
      expected: 'generated/nested/hello.ts',
    });

    test({
      inputPattern: 'a+b/**/*.wgsl',
      outputPattern: 'generated/**/*.ts',
      fileName: 'a+b/nested/hello.wgsl',
      expected: 'generated/nested/hello.ts',
    });

    test({
      inputPattern: 'a^b$c|d/**/*.wgsl',
      outputPattern: 'generated/**/*.ts',
      fileName: 'a^b$c|d/nested/hello.wgsl',
      expected: 'generated/nested/hello.ts',
    });

    test({
      inputPattern: 'v1.0/**/*.wgsl',
      outputPattern: 'generated/**/*.ts',
      fileName: 'v1.0/nested/hello.wgsl',
      expected: 'generated/nested/hello.ts',
    });
  });

  it('supports ?, character classes and multiple * in the input pattern', () => {
    test({
      inputPattern: 'shader?/**/*.wgsl',
      outputPattern: 'generated/**/*.ts',
      fileName: 'shaderA/nested/hello.wgsl',
      expected: 'generated/nested/hello.ts',
    });

    test({
      inputPattern: 'shader[0-9]/**/*.wgsl',
      outputPattern: 'generated/**/*.ts',
      fileName: 'shader1/nested/hello.wgsl',
      expected: 'generated/nested/hello.ts',
    });

    test({
      inputPattern: 'shader[!0-9]/**/*.wgsl',
      outputPattern: 'generated/**/*.ts',
      fileName: 'shaderA/nested/hello.wgsl',
      expected: 'generated/nested/hello.ts',
    });

    test({
      inputPattern: 'src/**/*.*.wgsl',
      outputPattern: 'generated/**/*.ts',
      fileName: 'src/nested/hello.frag.wgsl',
      expected: 'generated/nested/hello.frag.ts',
    });
  });
});
