import { getFormatInfo } from '../formats.ts';
import type { NativeApi } from '../native.ts';
import type { Snapshot } from '../types.ts';

type Variant = 'float' | 'float-load' | 'float-ms' | 'uint' | 'sint' | 'depth' | 'depth-ms';

const COMMON_WGSL = /* wgsl */ `
struct Params {
  channels: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}
@group(0) @binding(0) var<uniform> params: Params;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var out: VSOut;
  let x = f32((i << 1u) & 2u);
  let y = f32(i & 2u);
  out.pos = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2f(x, y);
  return out;
}

fn finalize(c: vec4f, pos: vec2f) -> vec4f {
  var rgb = c.rgb;
  if (params.channels == 1u) {
    rgb = vec3f(c.r);
  } else if (params.channels == 2u) {
    rgb = vec3f(c.r, c.g, 0.0);
  }
  let cell = floor(pos / 8.0);
  let even = (i32(cell.x) + i32(cell.y)) % 2 == 0;
  let checker = select(0.28, 0.4, even);
  let a = select(1.0, clamp(c.a, 0.0, 1.0), params.channels == 4u);
  return vec4f(mix(vec3f(checker), clamp(rgb, vec3f(0.0), vec3f(1.0)), a), 1.0);
}

fn texel(uv: vec2f, dims: vec2f) -> vec2i {
  return vec2i(clamp(uv * dims, vec2f(0.0), dims - vec2f(1.0)));
}

// Perspective depth clusters just below 1.0, so stretch the interesting range:
// the far plane becomes black and closer surfaces get brighter.
fn depthToColor(d: f32) -> vec4f {
  let v = pow(clamp(1.0 - d, 0.0, 1.0), 0.25);
  return vec4f(v, v, v, 1.0);
}
`;

const FRAGMENT_WGSL: Record<Variant, string> = {
  float: /* wgsl */ `
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@fragment fn fs(@builtin(position) pos: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  return finalize(textureSampleLevel(tex, samp, uv, 0.0), pos.xy);
}`,
  'float-load': /* wgsl */ `
@group(0) @binding(1) var tex: texture_2d<f32>;
@fragment fn fs(@builtin(position) pos: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  return finalize(textureLoad(tex, texel(uv, dims), 0), pos.xy);
}`,
  'float-ms': /* wgsl */ `
@group(0) @binding(1) var tex: texture_multisampled_2d<f32>;
@fragment fn fs(@builtin(position) pos: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  return finalize(textureLoad(tex, texel(uv, dims), 0), pos.xy);
}`,
  uint: /* wgsl */ `
@group(0) @binding(1) var tex: texture_2d<u32>;
@fragment fn fs(@builtin(position) pos: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  return finalize(vec4f(textureLoad(tex, texel(uv, dims), 0)) / 255.0, pos.xy);
}`,
  sint: /* wgsl */ `
@group(0) @binding(1) var tex: texture_2d<i32>;
@fragment fn fs(@builtin(position) pos: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  return finalize(vec4f(textureLoad(tex, texel(uv, dims), 0)) / 255.0 + 0.5, pos.xy);
}`,
  depth: /* wgsl */ `
@group(0) @binding(1) var tex: texture_depth_2d;
@fragment fn fs(@builtin(position) pos: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  let d = textureLoad(tex, texel(uv, dims), 0);
  return finalize(depthToColor(d), pos.xy);
}`,
  'depth-ms': /* wgsl */ `
@group(0) @binding(1) var tex: texture_depth_multisampled_2d;
@fragment fn fs(@builtin(position) pos: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  let d = textureLoad(tex, texel(uv, dims), 0);
  return finalize(depthToColor(d), pos.xy);
}`,
};

const TEXTURE_LAYOUT: Record<Variant, GPUTextureBindingLayout> = {
  float: { sampleType: 'float' },
  'float-load': { sampleType: 'unfilterable-float' },
  'float-ms': { sampleType: 'unfilterable-float', multisampled: true },
  uint: { sampleType: 'uint' },
  sint: { sampleType: 'sint' },
  depth: { sampleType: 'depth' },
  'depth-ms': { sampleType: 'depth', multisampled: true },
};

function variantFor(snapshot: Snapshot): Variant | undefined {
  const info = getFormatInfo(snapshot.format);
  const multisampled = snapshot.sampleCount > 1;
  switch (info.kind) {
    case 'float':
      return multisampled ? 'float-ms' : 'float';
    case 'unfilterable-float':
      return multisampled ? 'float-ms' : 'float-load';
    case 'uint':
      return multisampled ? undefined : 'uint';
    case 'sint':
      return multisampled ? undefined : 'sint';
    case 'depth':
      return multisampled ? 'depth-ms' : 'depth';
    default:
      return undefined;
  }
}

/**
 * Draws snapshot textures into regular 2D canvases, so that they can be
 * shown anywhere in the DOM. Uses a single hidden WebGPU canvas as the
 * intermediate render target.
 */
export class TexturePreviewer {
  readonly device: GPUDevice;
  readonly #native: NativeApi;
  readonly #canvas: HTMLCanvasElement;
  readonly #context: GPUCanvasContext | null;
  readonly #format: GPUTextureFormat;
  readonly #params: GPUBuffer;
  readonly #sampler: GPUSampler;
  readonly #pipelines = new Map<Variant, GPURenderPipeline>();
  readonly #layouts = new Map<Variant, GPUBindGroupLayout>();
  readonly #bindGroups = new WeakMap<GPUTexture, Map<Variant, GPUBindGroup>>();
  #broken = false;

  constructor(device: GPUDevice, native: NativeApi) {
    this.device = device;
    this.#native = native;
    this.#canvas = document.createElement('canvas');
    this.#canvas.width = 1;
    this.#canvas.height = 1;
    this.#context = this.#canvas.getContext('webgpu');
    this.#format = navigator.gpu.getPreferredCanvasFormat();
    if (this.#context) {
      native.configure.call(this.#context, {
        device,
        format: this.#format,
        alphaMode: 'opaque',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    this.#params = native.createBuffer.call(device, {
      label: 'webgpu-inspector preview params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.#sampler = device.createSampler({
      label: 'webgpu-inspector preview sampler',
      magFilter: 'linear',
      minFilter: 'linear',
    });
  }

  /** Whether this snapshot can be shown at all */
  static canPreview(snapshot: Snapshot): boolean {
    return variantFor(snapshot) !== undefined;
  }

  /**
   * Renders the snapshot into the target canvas at the given size.
   * Returns false if the snapshot could not be displayed.
   */
  drawInto(target: HTMLCanvasElement, snapshot: Snapshot, width: number, height: number): boolean {
    const variant = variantFor(snapshot);
    if (!variant || this.#broken || !this.#context) {
      return false;
    }

    try {
      if (this.#canvas.width !== width || this.#canvas.height !== height) {
        this.#canvas.width = width;
        this.#canvas.height = height;
      }

      const pipeline = this.#pipelineFor(variant);
      const bindGroup = this.#bindGroupFor(snapshot, variant);
      const { channels } = getFormatInfo(snapshot.format);
      this.device.queue.writeBuffer(this.#params, 0, new Uint32Array([channels, 0, 0, 0]));

      const encoder = this.#native.createCommandEncoder.call(this.device, {
        label: 'webgpu-inspector preview',
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.#native.createView.call(this.#native.getCurrentTexture.call(this.#context)),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      this.#native.submit.call(this.device.queue, [encoder.finish()]);

      if (target.width !== width || target.height !== height) {
        target.width = width;
        target.height = height;
      }
      const ctx2d = target.getContext('2d');
      if (!ctx2d) {
        return false;
      }
      ctx2d.drawImage(this.#canvas, 0, 0);
      return true;
    } catch (err) {
      this.#broken = true;
      console.warn('[webgpu-inspector] texture preview failed', err);
      return false;
    }
  }

  #layoutFor(variant: Variant): GPUBindGroupLayout {
    let layout = this.#layouts.get(variant);
    if (!layout) {
      const entries: GPUBindGroupLayoutEntry[] = [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: TEXTURE_LAYOUT[variant] },
      ];
      if (variant === 'float') {
        entries.push({
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        });
      }
      layout = this.device.createBindGroupLayout({
        label: `webgpu-inspector preview layout (${variant})`,
        entries,
      });
      this.#layouts.set(variant, layout);
    }
    return layout;
  }

  #pipelineFor(variant: Variant): GPURenderPipeline {
    let pipeline = this.#pipelines.get(variant);
    if (!pipeline) {
      const module = this.device.createShaderModule({
        label: `webgpu-inspector preview shader (${variant})`,
        code: COMMON_WGSL + FRAGMENT_WGSL[variant],
      });
      pipeline = this.device.createRenderPipeline({
        label: `webgpu-inspector preview pipeline (${variant})`,
        layout: this.device.createPipelineLayout({
          bindGroupLayouts: [this.#layoutFor(variant)],
        }),
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: this.#format }] },
        primitive: { topology: 'triangle-list' },
      });
      this.#pipelines.set(variant, pipeline);
    }
    return pipeline;
  }

  #bindGroupFor(snapshot: Snapshot, variant: Variant): GPUBindGroup {
    let perTexture = this.#bindGroups.get(snapshot.texture);
    if (!perTexture) {
      perTexture = new Map();
      this.#bindGroups.set(snapshot.texture, perTexture);
    }
    let bindGroup = perTexture.get(variant);
    if (!bindGroup) {
      const { hasDepth } = getFormatInfo(snapshot.format);
      const view = this.#native.createView.call(
        snapshot.texture,
        hasDepth ? { aspect: 'depth-only' } : undefined,
      );
      const entries: GPUBindGroupEntry[] = [
        { binding: 0, resource: { buffer: this.#params } },
        { binding: 1, resource: view },
      ];
      if (variant === 'float') {
        entries.push({ binding: 2, resource: this.#sampler });
      }
      bindGroup = this.#native.createBindGroup.call(this.device, {
        label: 'webgpu-inspector preview bind group',
        layout: this.#layoutFor(variant),
        entries,
      });
      perTexture.set(variant, bindGroup);
    }
    return bindGroup;
  }
}
