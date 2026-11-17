import type { TgpuBuffer, TgpuReadonly, ValidateStorageSchema, d } from 'typegpu';

import { useRootResource } from './use-root-resource.ts';

export interface UseReadonlyOptions<TSchema extends d.AnyWgslData> {
  initial?: ((buffer: TgpuBuffer<NoInfer<TSchema>>) => void) | d.InferInput<NoInfer<TSchema>>;
  onInit?: (buffer: TgpuReadonly<TSchema>) => void;
}

export function useReadonly<TSchema extends d.AnyWgslData>(
  _schema: ValidateStorageSchema<TSchema>,
  options?: UseReadonlyOptions<TSchema>,
): TgpuReadonly<TSchema> {
  const { initial, onInit } = options ?? {};

  const [readonly] = useRootResource(
    _schema,
    (root, schema) => {
      const readonly = root.createReadonly(schema, initial);
      onInit?.(readonly);
      return readonly;
    },
    (readonly) => readonly.buffer.destroy(),
  );

  return readonly;
}
