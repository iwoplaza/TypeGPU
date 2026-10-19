/**
 * CPU-side slider physics, same as ../runtime/slider.ts. Points are stored in
 * Float32Arrays (x, y interleaved), which rounds every component to f32 just like
 * `d.vec2f` does in the runtime variant.
 */
import {
  BEZIER_TEXTURE_SIZE,
  BEZIER_WORKGROUP_SIZE,
  SLIDER_BBOX,
  SLIDER_TOTAL_LENGTH,
} from './constants.ts';

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(low, value), high);
const saturate = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (edge0: number, edge1: number, x: number) => {
  if (edge0 === edge1) {
    return 0;
  }
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3 - 2 * t);
};

export class Slider {
  #device: GPUDevice;
  #pos: Float32Array;
  #normals: Float32Array;
  #prev: Float32Array;
  #invMass: Float32Array;
  #targetX: number;
  #controlPoints: Float32Array;
  #yOffset: number;
  #endCap = new Float32Array(4);
  #computeBezierPipeline: GPUComputePipeline;
  #computeBezierBindGroup: GPUBindGroup;

  pointsBuffer: GPUBuffer;
  controlPointsBuffer: GPUBuffer;
  normalsBuffer: GPUBuffer;
  bezierTexture: GPUTexture;
  endCapBuffer: GPUBuffer;

  readonly n: number;
  readonly totalLength: number;
  readonly restLen: number;
  readonly baseY: number;
  readonly anchor: readonly [number, number];

  // Physics parameters
  iterations = 16;
  substeps = 6;
  damping = 0.01;
  bendingStrength = 0.1;
  archStrength = 2;
  endFlatCount = 1;
  endFlatStiffness = 0.05;
  bendingExponent = 1.2;
  archEdgeDeadzone = 0.01;

  constructor(
    device: GPUDevice,
    bezierModule: GPUShaderModule,
    start: readonly [number, number],
    end: readonly [number, number],
    numPoints: number,
    yOffset = 0,
  ) {
    this.#device = device;
    this.n = Math.max(2, numPoints | 0);
    this.anchor = start;
    this.baseY = start[1];
    this.#targetX = end[0];
    this.#yOffset = yOffset;

    this.totalLength = SLIDER_TOTAL_LENGTH;
    this.restLen = this.totalLength / (this.n - 1);

    this.#pos = new Float32Array(this.n * 2);
    this.#controlPoints = new Float32Array((this.n - 1) * 2);
    this.#normals = new Float32Array(this.n * 2);
    this.#prev = new Float32Array(this.n * 2);
    this.#invMass = new Float32Array(this.n);

    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      const x = start[0] * (1 - t) + end[0] * t;
      const y = start[1] * (1 - t) + end[1] * t + this.#yOffset;
      this.#setPos(i, x, y);
      this.#setPrev(i, x, y);
      this.#normals[i * 2] = 0;
      this.#normals[i * 2 + 1] = 1;
      this.#invMass[i] = i === 0 || i === this.n - 1 ? 0 : 1;
      if (i < this.n - 1) {
        const t2 = (i + 0.5) / (this.n - 1);
        const cx = start[0] * (1 - t2) + end[0] * t2;
        const cy = start[1] * (1 - t2) + end[1] * t2 + this.#yOffset;
        this.#controlPoints[i * 2] = cx;
        this.#controlPoints[i * 2 + 1] = cy;
      }
    }

    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const createInitializedBuffer = (data: Float32Array, usage: number) => {
      const buffer = device.createBuffer({ size: data.byteLength, usage, mappedAtCreation: true });
      new Float32Array(buffer.getMappedRange()).set(data);
      buffer.unmap();
      return buffer;
    };

    this.pointsBuffer = createInitializedBuffer(this.#pos, storageUsage);
    this.controlPointsBuffer = createInitializedBuffer(this.#controlPoints, storageUsage);
    this.normalsBuffer = createInitializedBuffer(this.#normals, storageUsage);

    this.bezierTexture = device.createTexture({
      size: BEZIER_TEXTURE_SIZE,
      format: 'rgba16float',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    });

    // vec4f uniform, initialized to zeros
    this.endCapBuffer = createInitializedBuffer(
      new Float32Array(4),
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    );

    this.#computeBezierPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: bezierModule },
    });
    this.#computeBezierBindGroup = device.createBindGroup({
      layout: this.#computeBezierPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.bezierTexture.createView() },
        { binding: 1, resource: { buffer: this.pointsBuffer } },
        { binding: 2, resource: { buffer: this.controlPointsBuffer } },
      ],
    });
  }

  get bbox(): [top: number, right: number, bottom: number, left: number] {
    return [SLIDER_BBOX.top, SLIDER_BBOX.right, SLIDER_BBOX.bottom, SLIDER_BBOX.left];
  }

  #setPos(i: number, x: number, y: number) {
    this.#pos[i * 2] = x;
    this.#pos[i * 2 + 1] = y;
  }

  #setPrev(i: number, x: number, y: number) {
    this.#prev[i * 2] = x;
    this.#prev[i * 2 + 1] = y;
  }

  setDragX(x: number) {
    const minX = this.anchor[0] - this.totalLength;
    const maxX = this.anchor[0] + this.totalLength;
    this.#targetX = clamp(x, minX, maxX);
  }

  update(dt: number) {
    if (dt <= 0) return;

    const h = dt / this.substeps;
    const damp = clamp(this.damping, 0, 0.999);
    const compression = Math.max(
      0,
      1 - Math.abs(this.#targetX - this.anchor[0]) / this.totalLength,
    );

    for (let s = 0; s < this.substeps; s++) {
      this.#integrate(h, damp, compression);
      this.#projectConstraints();
    }

    this.#computeNormals();
    this.#computeControlPoints();
    this.#updateGPUBuffer();

    const encoder = this.#device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.#computeBezierPipeline);
    pass.setBindGroup(0, this.#computeBezierBindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(BEZIER_TEXTURE_SIZE[0] / BEZIER_WORKGROUP_SIZE[0]),
      Math.ceil(BEZIER_TEXTURE_SIZE[1] / BEZIER_WORKGROUP_SIZE[1]),
    );
    pass.end();
    this.#device.queue.submit([encoder.finish()]);
  }

  #integrate(h: number, damp: number, compression: number) {
    const pos = this.#pos;
    const prev = this.#prev;
    for (let i = 0; i < this.n; i++) {
      const px = pos[i * 2];
      const py = pos[i * 2 + 1];

      // Pin endpoints
      if (i === 0) {
        this.#setPos(i, this.anchor[0], this.anchor[1] + this.#yOffset);
        this.#setPrev(i, this.anchor[0], this.anchor[1] + this.#yOffset);
        continue;
      }
      if (i === this.n - 1) {
        this.#setPos(i, this.#targetX, 0.08 + this.#yOffset);
        this.#setPrev(i, this.#targetX, 0.08 + this.#yOffset);
        continue;
      }

      // Verlet integration with damping
      const vx = (px - prev[i * 2]) * (1 - damp);
      const vy = (py - prev[i * 2 + 1]) * (1 - damp);

      // Arch bias in middle section only
      let ay = 0;
      if (compression > 0) {
        const t = i / (this.n - 1);
        const edge = this.archEdgeDeadzone;
        const window = smoothstep(edge, 1 - edge, t) * smoothstep(edge, 1 - edge, 1 - t);
        const profile = Math.sin(Math.PI * t) * window;
        ay = this.archStrength * profile * compression;
      }

      this.#setPrev(i, px, py);
      this.#setPos(i, px + vx, py + vy + ay * h * h);

      // Keep above baseline
      if (pos[i * 2 + 1] < this.baseY + this.#yOffset) {
        pos[i * 2 + 1] = this.baseY + this.#yOffset;
      }
    }
  }

  #projectConstraints() {
    for (let it = 0; it < this.iterations; it++) {
      // Segment length constraints
      for (let i = 0; i < this.n - 1; i++) {
        this.#projectDistance(i, i + 1, this.restLen, 0.1);
      }

      // Bending resistance (stronger at ends)
      for (let i = 1; i < this.n - 1; i++) {
        const t = i / (this.n - 1);
        const distFromCenter = Math.abs(t - 0.5) * 2;
        const strength = distFromCenter ** this.bendingExponent;
        const k = this.bendingStrength * (0.05 + 0.95 * strength);
        this.#projectDistance(i - 1, i + 1, 2 * this.restLen, k);
      }

      // Flatten ends
      if (this.endFlatCount > 0) {
        const count = Math.min(this.endFlatCount, this.n - 2);
        for (let i = 1; i <= count; i++) {
          this.#projectLineY(i, this.baseY + this.#yOffset, this.endFlatStiffness);
        }
        for (let i = this.n - 1 - count; i < this.n - 1; i++) {
          this.#projectLineY(i, this.baseY + this.#yOffset, this.endFlatStiffness);
        }
      }

      // Re-pin endpoints
      this.#setPos(0, this.anchor[0], this.anchor[1] + this.#yOffset);
      this.#setPos(this.n - 1, this.#targetX, 0.08 + this.#yOffset);
    }
  }

  #projectDistance(i: number, j: number, rest: number, k: number) {
    const pos = this.#pos;
    const dx = pos[j * 2] - pos[i * 2];
    const dy = pos[j * 2 + 1] - pos[i * 2 + 1];
    const len = Math.hypot(dx, dy);

    if (len < 1e-8) return;

    const w1 = this.#invMass[i];
    const w2 = this.#invMass[j];
    const wsum = w1 + w2;
    if (wsum <= 0) return;

    const diff = (len - rest) / len;
    const c1 = (w1 / wsum) * k;
    const c2 = (w2 / wsum) * k;

    this.#setPos(i, pos[i * 2] + dx * diff * c1, pos[i * 2 + 1] + dy * diff * c1);
    this.#setPos(j, pos[j * 2] - dx * diff * c2, pos[j * 2 + 1] - dy * diff * c2);
  }

  #projectLineY(i: number, yTarget: number, k: number) {
    if (i <= 0 || i >= this.n - 1 || this.#invMass[i] <= 0) return;
    const pos = this.#pos;
    pos[i * 2 + 1] = pos[i * 2 + 1] + (yTarget - pos[i * 2 + 1]) * saturate(k);
  }

  #computeNormals() {
    const n = this.n;
    const pos = this.#pos;
    const normals = this.#normals;
    const eps = 1e-6;
    for (let i = 0; i < n; i++) {
      let dx: number;
      let dy: number;

      if (i === 0 && n > 1) {
        dx = pos[2] - pos[0];
        dy = pos[3] - pos[1];
      } else if (i === n - 1 && n > 1) {
        dx = pos[(n - 1) * 2] - pos[(n - 2) * 2];
        dy = pos[(n - 1) * 2 + 1] - pos[(n - 2) * 2 + 1];
      } else {
        dx = pos[(i + 1) * 2] - pos[(i - 1) * 2];
        dy = pos[(i + 1) * 2 + 1] - pos[(i - 1) * 2 + 1];
      }

      let len = Math.hypot(dx, dy);
      if (len < eps) {
        if (i > 0) {
          dx = pos[i * 2] - pos[(i - 1) * 2];
          dy = pos[i * 2 + 1] - pos[(i - 1) * 2 + 1];
          len = Math.hypot(dx, dy);
        }
        if (len < eps && i < n - 1) {
          dx = pos[(i + 1) * 2] - pos[i * 2];
          dy = pos[(i + 1) * 2 + 1] - pos[i * 2 + 1];
          len = Math.hypot(dx, dy);
        }
        if (len < eps) {
          normals[i * 2] = i > 0 ? normals[(i - 1) * 2] : 0;
          normals[i * 2 + 1] = i > 0 ? normals[(i - 1) * 2 + 1] : 1;
          continue;
        }
      }

      dx /= len;
      dy /= len;
      normals[i * 2] = -dy;
      normals[i * 2 + 1] = dx;
    }
  }

  #computeControlPoints() {
    const pos = this.#pos;
    const normals = this.#normals;
    const cps = this.#controlPoints;
    for (let i = 0; i < this.n - 1; i++) {
      const Ax = pos[i * 2];
      const Ay = pos[i * 2 + 1];
      const Bx = pos[(i + 1) * 2];
      const By = pos[(i + 1) * 2 + 1];

      const nAx = normals[i * 2];
      const nAy = normals[i * 2 + 1];
      const nBx = normals[(i + 1) * 2];
      const nBy = normals[(i + 1) * 2 + 1];

      if (i === 0 || i === this.n - 2) {
        cps[i * 2] = (Ax + Bx) * 0.5;
        cps[i * 2 + 1] = (Ay + By) * 0.5;
        continue;
      }

      if (nAx * nBx + nAy * nBy > 0.99) {
        // Nearly parallel normals; midpoint fallback prevents explosions.
        // tiny offset opposite to the normal (any of them)
        cps[i * 2] = (Ax + Bx) * 0.5;
        cps[i * 2 + 1] = (Ay + By) * 0.5;
        continue;
      }

      const tAx = nAy;
      const tAy = -nAx;
      const tBx = nBy;
      const tBy = -nBx;

      // Solve A + t*tA = B - s*tB  ->  t*tA + s*tB = (B - A)
      const dx = Bx - Ax;
      const dy = By - Ay;
      const denom = tAx * tBy - tAy * tBx; // cross(tA, tB)

      if (Math.abs(denom) <= 1e-6) {
        // Nearly parallel tangents; midpoint fallback prevents explosions.
        cps[i * 2] = (Ax + Bx) * 0.5;
        cps[i * 2 + 1] = (Ay + By) * 0.5;
        continue;
      }

      // t = cross(B - A, tB) / cross(tA, tB)
      const t = (dx * tBy - dy * tBx) / denom;
      cps[i * 2] = Ax + t * tAx;
      cps[i * 2 + 1] = Ay + t * tAy;
    }
  }

  #updateGPUBuffer() {
    const queue = this.#device.queue;
    queue.writeBuffer(this.pointsBuffer, 0, this.#pos);
    queue.writeBuffer(this.controlPointsBuffer, 0, this.#controlPoints);
    queue.writeBuffer(this.normalsBuffer, 0, this.#normals);

    const len = this.n;
    this.#endCap[0] = this.#pos[(len - 2) * 2];
    this.#endCap[1] = this.#pos[(len - 2) * 2 + 1];
    this.#endCap[2] = this.#pos[(len - 1) * 2];
    this.#endCap[3] = this.#pos[(len - 1) * 2 + 1];
    queue.writeBuffer(this.endCapBuffer, 0, this.#endCap);
  }
}
