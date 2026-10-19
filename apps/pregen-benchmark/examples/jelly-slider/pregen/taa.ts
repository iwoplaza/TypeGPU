import { TAA_WORKGROUP_SIZE } from './constants.ts';

export function createTaaTextures(device: GPUDevice, width: number, height: number) {
  return [0, 1].map(() => {
    const texture = device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    });

    return {
      write: texture.createView(),
      sampled: texture.createView(),
    };
  });
}

export class TAAResolver {
  #device: GPUDevice;
  #pipeline: GPUComputePipeline;
  #textures: ReturnType<typeof createTaaTextures>;
  #width: number;
  #height: number;

  constructor(device: GPUDevice, taaModule: GPUShaderModule, width: number, height: number) {
    this.#device = device;
    this.#width = width;
    this.#height = height;

    this.#pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: taaModule },
    });

    this.#textures = createTaaTextures(device, width, height);
  }

  resolve(currentTexture: GPUTextureView, frameCount: number, currentFrame: number) {
    const previousFrame = 1 - currentFrame;

    // Created every frame, like in the runtime variant
    const bindGroup = this.#device.createBindGroup({
      layout: this.#pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: currentTexture },
        {
          binding: 1,
          resource: frameCount === 1 ? currentTexture : this.#textures[previousFrame].sampled,
        },
        { binding: 2, resource: this.#textures[currentFrame].write },
      ],
    });

    const encoder = this.#device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(this.#width / TAA_WORKGROUP_SIZE[0]),
      Math.ceil(this.#height / TAA_WORKGROUP_SIZE[1]),
    );
    pass.end();
    this.#device.queue.submit([encoder.finish()]);

    return this.#textures[currentFrame].sampled;
  }

  resize(width: number, height: number) {
    this.#width = width;
    this.#height = height;
    this.#textures = createTaaTextures(this.#device, width, height);
  }

  getResolvedTexture(frame: number) {
    return this.#textures[frame].sampled;
  }
}
