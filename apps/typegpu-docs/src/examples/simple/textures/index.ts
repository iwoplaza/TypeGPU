import { tgpu, common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

// #region Texture

const response = await fetch('/TypeGPU/plums.jpg');
const imageBitmap = await createImageBitmap(await response.blob());

const texture = root
  .createTexture({
    size: [imageBitmap.width, imageBitmap.height],
    format: 'rgba8unorm',
    // Every mip level halves the size, down to 1x1.
    mipLevelCount: Math.floor(Math.log2(Math.max(imageBitmap.width, imageBitmap.height))) + 1,
  })
  // 'render' is needed for both image uploads and mipmap generation.
  .$usage('sampled', 'render');

texture.write(imageBitmap);
texture.generateMipmaps();
const textureView = texture.createView(d.texture2d(d.f32));

// Samplers are cheap to create, so a new one is made whenever a control changes.
const samplerOptions = {
  magFilter: 'linear' as GPUFilterMode,
  minFilter: 'linear' as GPUFilterMode,
  mipmapFilter: 'linear' as GPUMipmapFilterMode,
  addressModeU: 'repeat' as GPUAddressMode,
  addressModeV: 'repeat' as GPUAddressMode,
};
const samplerLayout = tgpu.bindGroupLayout({
  sampler: { sampler: 'filtering' },
});
let samplerGroup = root.createBindGroup(samplerLayout, {
  sampler: root.createSampler(samplerOptions),
});

// #endregion

// #region Pipeline

const Params = d.struct({
  time: d.f32,
  tiling: d.f32,
  aspect: d.f32,
});
const params = root.createUniform(Params, { time: 0, tiling: 1, aspect: 1 });

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const p = params.$;
    // Tilt the plane away from the camera so the far part shrinks a lot.
    // That is where mipmaps (or their absence) become visible.
    // Perspective divide: the distance grows steadily from 1 at the bottom edge
    // to 5 at the top edge, with the horizon just above the screen.
    const depth = 1.25 / (uv.y + 0.25);
    const planeUv = d.vec2f((uv.x - 0.5) * depth * p.aspect + 0.5, depth);
    const rotation = p.time * 0.1;
    const c = std.cos(rotation);
    const s = std.sin(rotation);
    const centered = planeUv - 0.5;
    const rotated = d.vec2f(c * centered.x - s * centered.y, s * centered.x + c * centered.y);
    const sampleUv = rotated * p.tiling + 0.5;
    // textureSample picks the mip level from how fast the UVs change between pixels.
    return std.textureSample(textureView.$, samplerLayout.$.sampler, sampleUv);
  },
});

// #endregion

function frame(timestamp: number) {
  frameId = requestAnimationFrame(frame);
  if (canvas.width === 0 || canvas.height === 0) {
    return;
  }
  params.patch({ time: timestamp / 1000, aspect: canvas.width / canvas.height });
  pipeline.with(samplerGroup).withColorAttachment({ view: context }).draw(3);
}
let frameId = requestAnimationFrame(frame);

// #region Example controls and cleanup

function updateSampler(changes: Partial<typeof samplerOptions>) {
  Object.assign(samplerOptions, changes);
  samplerGroup = root.createBindGroup(samplerLayout, {
    sampler: root.createSampler(samplerOptions),
  });
}

export const controls = defineControls({
  Tiling: {
    initial: 1,
    min: 0.5,
    max: 8,
    step: 0.5,
    onSliderChange(value: number) {
      params.patch({ tiling: value });
    },
  },
  'Mag filter': {
    initial: 'linear',
    options: ['linear', 'nearest'],
    onSelectChange(value) {
      updateSampler({ magFilter: value as GPUFilterMode });
    },
  },
  'Mipmap filter': {
    initial: 'linear',
    options: ['linear', 'nearest'],
    onSelectChange(value) {
      updateSampler({ mipmapFilter: value as GPUMipmapFilterMode });
    },
  },
  'Address mode': {
    initial: 'repeat',
    options: ['repeat', 'mirror-repeat', 'clamp-to-edge'],
    onSelectChange(value) {
      updateSampler({
        addressModeU: value as GPUAddressMode,
        addressModeV: value as GPUAddressMode,
      });
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}

// #endregion
