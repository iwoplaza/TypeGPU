import type { d, TgpuBuffer, ValidateBufferSchema } from 'typegpu';

import { useRootResource } from './use-root-resource.ts';

export interface UseBufferOptions<TSchema extends d.AnyData> {
  initial?: ((buffer: TgpuBuffer<TSchema>) => void) | d.InferInput<NoInfer<TSchema>>;
  onInit?: (buffer: TgpuBuffer<TSchema>) => void;
}

export function useBuffer<TSchema extends d.AnyData>(
  _schema: ValidateBufferSchema<TSchema>,
  options?: UseBufferOptions<TSchema>,
): TgpuBuffer<TSchema> {
  const { initial, onInit } = options ?? {};

  const [buffer] = useRootResource(
    _schema,
    (root, schema) => {
      const buffer = root.createBuffer(schema, initial);
      onInit?.(buffer);
      return buffer;
    },
    (buffer) => buffer.destroy(),
  );

  return buffer;
}
