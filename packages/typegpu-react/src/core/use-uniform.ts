import type { TgpuUniform, d, ValidateUniformSchema, TgpuBuffer } from 'typegpu';

import { useRootResource } from './use-root-resource.ts';

export interface UseUniformOptions<TSchema extends d.AnyWgslData> {
  initial?: ((buffer: TgpuBuffer<NoInfer<TSchema>>) => void) | d.InferInput<NoInfer<TSchema>>;
  onInit?: (buffer: TgpuUniform<TSchema>) => void;
}

export function useUniform<TSchema extends d.AnyWgslData>(
  _schema: ValidateUniformSchema<TSchema>,
  options?: UseUniformOptions<TSchema>,
): TgpuUniform<TSchema> {
  const { initial, onInit } = options ?? {};

  const [uniform] = useRootResource(
    _schema,
    (root, schema) => {
      const uniform = root.createUniform(schema, initial);
      onInit?.(uniform);
      return uniform;
    },
    (uniform) => uniform.buffer.destroy(),
  );

  return uniform;
}
