import type { Infer, MemIdentity } from '../shared/repr.ts';
import { $internal } from '../shared/symbols.ts';
import {
  $gpuRepr,
  $memIdent,
  $repr,
  $validStorageSchema,
  $validUniformSchema,
  $validVertexSchema,
} from '../shared/symbols.ts';
import { isLooseDecorated } from './dataTypes.ts';
import type { Atomic, atomicI32, atomicU32, BaseData, I32, U32 } from './wgslTypes.ts';
import { isAtomic, isDecorated, isWgslArray, isWgslStruct } from './wgslTypes.ts';

// ----------
// Public API
// ----------

/**
 * Marks a concrete integer scalar type schema (u32 or i32) as a WGSL atomic.
 *
 * @example
 * const atomicU32 = d.atomic(d.u32);
 * const atomicI32 = d.atomic(d.i32);
 *
 * @param data Underlying type schema.
 */
export function atomic<TSchema extends U32 | I32>(data: TSchema): Atomic<TSchema> {
  return new AtomicImpl(data);
}

export function containsAtomic(schema: BaseData): boolean {
  if (isAtomic(schema)) {
    return true;
  }
  if (isWgslStruct(schema)) {
    return Object.values(schema.propTypes).some(containsAtomic);
  }
  if (isWgslArray(schema)) {
    return containsAtomic(schema.elementType);
  }
  if (isDecorated(schema) || isLooseDecorated(schema)) {
    return containsAtomic(schema.inner);
  }
  return false;
}

// --------------
// Implementation
// --------------

class AtomicImpl<TSchema extends U32 | I32> implements Atomic<TSchema> {
  readonly [$internal] = {};
  readonly type = 'atomic';
  readonly inner: TSchema;

  // Type-tokens, not available at runtime
  declare readonly [$repr]: Infer<TSchema>;
  declare readonly [$memIdent]: MemIdentity<TSchema>;
  declare readonly [$gpuRepr]: TSchema extends U32 ? atomicU32 : atomicI32;
  declare readonly [$validStorageSchema]: true;
  declare readonly [$validUniformSchema]: true;
  declare readonly [$validVertexSchema]: true;
  // ---

  constructor(inner: TSchema) {
    this.inner = inner;
  }
}
