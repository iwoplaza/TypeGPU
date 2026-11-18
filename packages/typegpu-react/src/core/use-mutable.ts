import type { TgpuBuffer, TgpuMutable, ValidateStorageSchema, d } from 'typegpu';

import { useRootResource } from './use-root-resource.ts';

export interface UseMutableOptions<TSchema extends d.AnyWgslData> {
  initial?: ((buffer: TgpuBuffer<NoInfer<TSchema>>) => void) | d.InferInput<NoInfer<TSchema>>;
  onInit?: (buffer: TgpuMutable<TSchema>) => void;
}

export function useMutable<TSchema extends d.AnyWgslData>(
  _schema: ValidateStorageSchema<TSchema>,
  options?: UseMutableOptions<TSchema>,
): TgpuMutable<TSchema> {
  const { initial, onInit } = options ?? {};

  const [mutable] = useRootResource(
    _schema,
    (root, schema) => {
      const mutable = root.createMutable(schema, initial);
      onInit?.(mutable);
      return mutable;
    },
    (mutable) => mutable.buffer.destroy(),
  );

  return mutable;
}
