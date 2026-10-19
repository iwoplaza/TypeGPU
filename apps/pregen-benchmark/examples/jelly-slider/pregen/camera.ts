import * as m from 'wgpu-matrix';

type Vec3 = readonly [number, number, number];

// Camera: { view, proj, viewInv, projInv: mat4x4f } = 4 x 64 bytes
const VIEW_OFFSET = 0;
const PROJ_OFFSET = 64;
const VIEW_INV_OFFSET = 128;
const PROJ_INV_OFFSET = 192;
const CAMERA_SIZE = 256;

const mat4 = () => new Float32Array(16);

function halton(index: number, base: number) {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f = f / base;
  }
  return result;
}

function* haltonSequence(base: number) {
  let index = 1;
  while (true) {
    yield halton(index, base);
    index++;
  }
}

export class CameraController {
  #device: GPUDevice;
  #buffer: GPUBuffer;
  #view: Float32Array;
  #proj: Float32Array;
  #viewInv: Float32Array;
  #projInv: Float32Array;
  #baseProj: Float32Array;
  #baseProjInv: Float32Array;
  #haltonX: Generator<number>;
  #haltonY: Generator<number>;
  #width: number;
  #height: number;

  constructor(
    device: GPUDevice,
    position: Vec3,
    target: Vec3,
    up: Vec3,
    fov: number,
    width: number,
    height: number,
    near = 0.1,
    far = 10,
  ) {
    this.#device = device;
    this.#width = width;
    this.#height = height;

    this.#view = m.mat4.lookAt(position, target, up, mat4());
    this.#baseProj = m.mat4.perspective(fov, width / height, near, far, mat4());
    this.#proj = this.#baseProj;

    this.#viewInv = m.mat4.invert(this.#view, mat4());
    this.#baseProjInv = m.mat4.invert(this.#baseProj, mat4());
    this.#projInv = this.#baseProjInv;

    this.#buffer = device.createBuffer({
      size: CAMERA_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    const initial = new Float32Array(this.#buffer.getMappedRange());
    initial.set(this.#view, VIEW_OFFSET / 4);
    initial.set(this.#proj, PROJ_OFFSET / 4);
    initial.set(this.#viewInv, VIEW_INV_OFFSET / 4);
    initial.set(this.#projInv, PROJ_INV_OFFSET / 4);
    this.#buffer.unmap();

    this.#haltonX = haltonSequence(2);
    this.#haltonY = haltonSequence(3);
  }

  #write(offset: number, matrix: Float32Array) {
    this.#device.queue.writeBuffer(this.#buffer, offset, matrix);
  }

  jitter() {
    const [jx, jy] = [this.#haltonX.next().value, this.#haltonY.next().value] as [number, number];

    const jitterX = ((jx - 0.5) * 2.0) / this.#width;
    const jitterY = ((jy - 0.5) * 2.0) / this.#height;

    const jitterMatrix = m.mat4.identity(mat4());
    jitterMatrix[12] = jitterX; // x translation in NDC
    jitterMatrix[13] = jitterY; // y translation in NDC

    const jitteredProj = m.mat4.mul(jitterMatrix, this.#baseProj, mat4());
    const jitteredProjInv = m.mat4.invert(jitteredProj, mat4());

    this.#write(PROJ_OFFSET, jitteredProj);
    this.#write(PROJ_INV_OFFSET, jitteredProjInv);
  }

  updateView(position: Vec3, target: Vec3, up: Vec3) {
    this.#view = m.mat4.lookAt(position, target, up, mat4());
    this.#viewInv = m.mat4.invert(this.#view, mat4());

    this.#write(VIEW_OFFSET, this.#view);
    this.#write(VIEW_INV_OFFSET, this.#viewInv);
  }

  updateProjection(fov: number, width: number, height: number, near = 0.1, far = 100) {
    this.#width = width;
    this.#height = height;

    this.#baseProj = m.mat4.perspective(fov, width / height, near, far, mat4());
    this.#baseProjInv = m.mat4.invert(this.#baseProj, mat4());

    this.#write(PROJ_OFFSET, this.#baseProj);
    this.#write(PROJ_INV_OFFSET, this.#baseProjInv);
  }

  get cameraBuffer() {
    return this.#buffer;
  }
}
