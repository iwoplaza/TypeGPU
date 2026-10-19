/**
 * Minimal binary readers/writers used for (de)serializing buffer data.
 *
 * These cover exactly what TypeGPU needs from `typed-binary`. That package can't be
 * tree-shaken well (it ships impure top-level schema instances and class fields), so
 * depending on it added ~15kB of minified code to every app using TypeGPU.
 */

export type Endianness = 'big' | 'little';

export function getSystemEndianness(): Endianness {
  const array = new Uint8Array(4);
  new Uint32Array(array.buffer)[0] = 1;
  return array[0] === 0 ? 'big' : 'little';
}

const systemEndianness = getSystemEndianness();

export interface IMeasurer {
  readonly size: number;
  add(bytes: number): IMeasurer;
}

interface IOBase {
  readonly currentByteOffset: number;
  seekTo(offset: number): void;
  skipBytes(bytes: number): void;
}

export interface ISerialInput extends IOBase {
  readByte(): number;
  readInt8(): number;
  readUint8(): number;
  readInt16(): number;
  readUint16(): number;
  readInt32(): number;
  readUint32(): number;
  readFloat32(): number;
}

export interface ISerialOutput extends IOBase {
  writeInt8(value: number): void;
  writeUint8(value: number): void;
  writeInt16(value: number): void;
  writeUint16(value: number): void;
  writeInt32(value: number): void;
  writeUint32(value: number): void;
  writeFloat32(value: number): void;
  writeSlice(bufferView: ArrayBufferView): void;
}

export class Measurer implements IMeasurer {
  size = 0;

  add(bytes: number): Measurer {
    this.size += bytes;
    return this;
  }
}

interface BufferIOOptions {
  byteOffset?: number;
  endianness?: Endianness | 'system';
}

class BufferIOBase implements IOBase {
  protected readonly dataView: DataView;
  protected readonly littleEndian: boolean;
  protected readonly needsByteSwap: boolean;
  protected byteOffset: number;

  constructor(buffer: ArrayBufferLike | ArrayBufferView, options?: BufferIOOptions) {
    const { byteOffset = 0, endianness = 'system' } = options ?? {};
    const resolvedEndianness = endianness === 'system' ? systemEndianness : endianness;
    this.littleEndian = resolvedEndianness === 'little';
    this.needsByteSwap = resolvedEndianness !== systemEndianness;

    if (ArrayBuffer.isView(buffer)) {
      this.byteOffset = byteOffset + buffer.byteOffset;
      this.dataView = new DataView(buffer.buffer);
    } else {
      this.byteOffset = byteOffset;
      this.dataView = new DataView(buffer);
    }
  }

  get currentByteOffset(): number {
    return this.byteOffset;
  }

  seekTo(offset: number): void {
    this.byteOffset = offset;
  }

  skipBytes(bytes: number): void {
    this.byteOffset += bytes;
  }
}

export class BufferReader extends BufferIOBase implements ISerialInput {
  readByte(): number {
    return this.dataView.getUint8(this.byteOffset++);
  }

  readInt8(): number {
    return this.dataView.getInt8(this.byteOffset++);
  }

  readUint8(): number {
    return this.dataView.getUint8(this.byteOffset++);
  }

  readInt16(): number {
    const value = this.dataView.getInt16(this.byteOffset, this.littleEndian);
    this.byteOffset += 2;
    return value;
  }

  readUint16(): number {
    const value = this.dataView.getUint16(this.byteOffset, this.littleEndian);
    this.byteOffset += 2;
    return value;
  }

  readInt32(): number {
    const value = this.dataView.getInt32(this.byteOffset, this.littleEndian);
    this.byteOffset += 4;
    return value;
  }

  readUint32(): number {
    const value = this.dataView.getUint32(this.byteOffset, this.littleEndian);
    this.byteOffset += 4;
    return value;
  }

  readFloat32(): number {
    const value = this.dataView.getFloat32(this.byteOffset, this.littleEndian);
    this.byteOffset += 4;
    return value;
  }
}

export class BufferWriter extends BufferIOBase implements ISerialOutput {
  writeInt8(value: number): void {
    this.dataView.setInt8(this.byteOffset++, value);
  }

  writeUint8(value: number): void {
    this.dataView.setUint8(this.byteOffset++, value);
  }

  writeInt16(value: number): void {
    this.dataView.setInt16(this.byteOffset, value, this.littleEndian);
    this.byteOffset += 2;
  }

  writeUint16(value: number): void {
    this.dataView.setUint16(this.byteOffset, value, this.littleEndian);
    this.byteOffset += 2;
  }

  writeInt32(value: number): void {
    this.dataView.setInt32(this.byteOffset, value, this.littleEndian);
    this.byteOffset += 4;
  }

  writeUint32(value: number): void {
    this.dataView.setUint32(this.byteOffset, value, this.littleEndian);
    this.byteOffset += 4;
  }

  writeFloat32(value: number): void {
    this.dataView.setFloat32(this.byteOffset, value, this.littleEndian);
    this.byteOffset += 4;
  }

  writeSlice(bufferView: ArrayBufferView): void {
    const src = new Uint8Array(bufferView.buffer, bufferView.byteOffset, bufferView.byteLength);
    const bytesPerElement = (bufferView as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1;

    if (this.needsByteSwap && bytesPerElement > 1) {
      for (let i = 0; i < src.length; i += bytesPerElement) {
        for (let j = bytesPerElement - 1; j >= 0; j--) {
          this.dataView.setUint8(this.byteOffset++, src[i + j] as number);
        }
      }
    } else {
      new Uint8Array(this.dataView.buffer, this.byteOffset).set(src);
      this.byteOffset += src.length;
    }
  }
}
