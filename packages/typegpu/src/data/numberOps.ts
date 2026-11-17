export const smoothstepScalar = (edge0: number, edge1: number, x: number): number => {
  if (edge0 === edge1) {
    return 0; // WGSL spec says this is an indeterminate value
  }
  const t = clampScalar((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3 - 2 * t);
};

export const clampScalar = (value: number, low: number, high: number) =>
  Math.min(Math.max(low, value), high);

const buf32 = new ArrayBuffer(4);
const f32arr = new Float32Array(buf32);
const u32arr = new Uint32Array(buf32);
const i32arr = new Int32Array(buf32);
export function bitcastU32toF32Impl(n: number): number {
  u32arr[0] = n;
  return f32arr[0] as number;
}

export function bitcastU32toI32Impl(n: number): number {
  u32arr[0] = n;
  return i32arr[0] as number;
}

export function bitcastF32toU32Impl(n: number): number {
  f32arr[0] = n;
  return u32arr[0] as number;
}

export const countOneBitsScalar = (e: number): number => {
  let v = e >>> 0;
  let count = 0;
  while (v !== 0) {
    v &= v - 1;
    count++;
  }
  return count;
};

export const countTrailingZerosScalar = (e: number): number =>
  e === 0 ? 32 : 31 - Math.clz32(e & -e);

export const firstLeadingBitScalar = (e: number, signed: boolean): number => {
  if (signed) {
    const v = e < 0 ? ~e : e;
    return v === 0 ? -1 : 31 - Math.clz32(v);
  }
  return e === 0 ? 0xffffffff : 31 - Math.clz32(e);
};

export const firstTrailingBitScalar = (e: number, signed: boolean): number => {
  if (e === 0) {
    return signed ? -1 : 0xffffffff;
  }
  return countTrailingZerosScalar(e);
};

export const reverseBitsScalar = (e: number, signed: boolean): number => {
  let v = e >>> 0;
  let result = 0;
  for (let i = 0; i < 32; i++) {
    result = (result << 1) | (v & 1);
    v >>>= 1;
  }
  return signed ? result | 0 : result >>> 0;
};

export const extractBitsScalar = (
  e: number,
  offset: number,
  count: number,
  signed: boolean,
): number => {
  const o = Math.min(offset, 32);
  const c = Math.min(count, 32 - o);
  if (c === 0) {
    return 0;
  }
  const shifted = (e >>> o) << (32 - c);
  return signed ? shifted >> (32 - c) : shifted >>> (32 - c);
};

export const insertBitsScalar = (
  e: number,
  newbits: number,
  offset: number,
  count: number,
  signed: boolean,
): number => {
  const o = Math.min(offset, 32);
  const c = Math.min(count, 32 - o);
  if (c === 0) {
    return e;
  }
  const mask = (0xffffffff >>> (32 - c)) << o;
  const result = (e & ~mask) | ((newbits << o) & mask);
  return signed ? result | 0 : result >>> 0;
};

export const dot4U8PackedScalar = (e1: number, e2: number): number => {
  let result = 0;
  for (let i = 0; i < 32; i += 8) {
    result += ((e1 >>> i) & 0xff) * ((e2 >>> i) & 0xff);
  }
  return result;
};

export const dot4I8PackedScalar = (e1: number, e2: number): number => {
  let result = 0;
  for (let i = 0; i < 32; i += 8) {
    result += (((e1 >>> i) << 24) >> 24) * (((e2 >>> i) << 24) >> 24);
  }
  return result;
};
