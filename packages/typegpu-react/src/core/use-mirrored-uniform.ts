import { useLayoutEffect, useMemo } from 'react';
import type { d, TgpuBuffer, TgpuUniform, ValidateUniformSchema } from 'typegpu';

import { $buffer } from './symbols.ts';
import { useRootResource } from './use-root-resource.ts';

interface MirroredValue<TSchema extends d.AnyWgslData> {
  schema: TSchema;
  readonly $: d.InferGPU<TSchema>;
  readonly [$buffer]: TgpuBuffer<TSchema>;
}

/** The last value written to each uniform, so that only changes get written */
const lastWrittenValues = new WeakMap<TgpuUniform<d.AnyWgslData>, unknown>();

export function useMirroredUniform<
  TSchema extends d.AnyWgslData,
  TValue extends d.InferInput<TSchema>,
>(_schema: ValidateUniformSchema<TSchema>, value: TValue): MirroredValue<TSchema> {
  const [uniform, schema] = useRootResource(
    _schema,
    (root, schema) => {
      const uniform = root.createUniform(schema, value);
      lastWrittenValues.set(uniform, value);
      return uniform;
    },
    (uniform) => uniform.buffer.destroy(),
  );

  useLayoutEffect(() => {
    if (lastWrittenValues.get(uniform) !== value) {
      uniform.write(value);
      lastWrittenValues.set(uniform, value);
    }
  }, [uniform, value]);

  const mirroredValue = useMemo(
    () => ({
      [$buffer]: uniform.buffer,
      schema,
      get $() {
        return uniform.$;
      },
    }),
    [schema, uniform],
  );

  return mirroredValue as MirroredValue<TSchema>;
}
