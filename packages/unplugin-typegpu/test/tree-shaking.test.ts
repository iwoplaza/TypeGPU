import virtual from '@rollup/plugin-virtual';
import { rollup } from 'rollup';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import rollupPlugin from '../src/rollup.ts';

const typegpuSrc = fileURLToPath(new URL('../../typegpu/src/', import.meta.url));

/**
 * Bundles `code` against the `typegpu` sources, treating them as side-effect free
 * like the published package, and returns the `typegpu` modules that made it into the chunk.
 */
async function bundledTypegpuModules(code: string): Promise<string[]> {
  const build = await rollup({
    input: 'entry',
    plugins: [
      virtual({ entry: code }),
      {
        name: 'resolve-typegpu-source',
        resolveId(id) {
          if (id === 'typegpu') {
            return `${typegpuSrc}index.js`;
          }
          return null;
        },
        transform(source, id) {
          if (!id.endsWith('.ts')) {
            return null;
          }
          return ts.transpileModule(source, {
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ESNext,
              verbatimModuleSyntax: true,
            },
          }).outputText;
        },
      },
      rollupPlugin({ include: [/\.m?[jt]sx?$/, /virtual:/] }),
    ],
    external: (id) =>
      !id.startsWith('.') &&
      !id.startsWith('/') &&
      !id.startsWith('\0') &&
      id !== 'typegpu' &&
      id !== 'entry',
    treeshake: {
      moduleSideEffects: (id) => !id.startsWith(typegpuSrc),
    },
    onwarn() {},
  });

  const { output } = await build.generate({ format: 'esm' });
  return Object.entries(output[0].modules)
    .filter(([id, info]) => id.startsWith(typegpuSrc) && info.renderedLength > 0)
    .map(([id]) => id.slice(typegpuSrc.length));
}

const program = (fragmentBody: string) => `
  import { tgpu, d, std } from 'typegpu';

  const root = await tgpu.init();
  const time = root.createUniform(d.f32);

  const pipeline = root.createRenderPipeline({
    vertex: () => {
      'use gpu';
      return { $position: d.vec4f() };
    },
    fragment: () => {
      'use gpu';
      ${fragmentBody}
      return d.vec4f(std.sin(time.$), 0, 0, 1);
    },
  });

  pipeline.withColorAttachment({ view: {} }).draw(3);
`;

const logModules = [
  'tgsl/consoleLog/logGenerator.ts',
  'tgsl/consoleLog/serializers.ts',
  'tgsl/consoleLog/deserializers.ts',
];

describe('shader console.log support', () => {
  test('is left out of programs that do not log', { timeout: 30_000 }, async () => {
    const modules = await bundledTypegpuModules(program(''));

    expect(modules).toContain('resolutionCtx.ts');
    for (const logModule of logModules) {
      expect(modules).not.toContain(logModule);
    }
  });

  test('is bundled with programs that log', { timeout: 30_000 }, async () => {
    const modules = await bundledTypegpuModules(program(`console.log('time', time.$);`));

    for (const logModule of logModules) {
      expect(modules).toContain(logModule);
    }
  });
});
