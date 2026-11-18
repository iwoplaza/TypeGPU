import { sizeOf } from '../../data/sizeOf.ts';
import { type BaseData, isWgslArray, isWgslStruct } from '../../data/wgslTypes.ts';

/**
 * Returns the number of u32 slots the log serializer writes for a value of the given type.
 * Struct fields and array elements are written back to back, without the padding
 * that WGSL memory layout would put between them.
 */
export function serializedSlotCount(dataType: BaseData): number {
  if (isWgslStruct(dataType)) {
    return Object.values(dataType.propTypes).reduce(
      (acc: number, propType) => acc + serializedSlotCount(propType),
      0,
    );
  }
  if (isWgslArray(dataType)) {
    return dataType.elementCount * serializedSlotCount(dataType.elementType);
  }
  return Math.ceil(sizeOf(dataType) / 4);
}
