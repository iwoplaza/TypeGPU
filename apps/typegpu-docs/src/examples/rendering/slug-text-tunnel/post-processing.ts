import type { ColorAttachment, TgpuRoot, TgpuUniform } from 'typegpu';
import { tgpu, common, d, std } from 'typegpu';

export const PostParams = d.struct({
  time: d.f32,
  aspect: d.f32,
  bloomIntensity: d.f32,
  speed: d.f32,
});

const blurLayout = tgpu.bindGroupLayout({
  src: { texture: d.texture2d(d.f32) },
  dst: { storageTexture: d.textureStorage2d('rgba16float') },
  linear: { sampler: 'filtering' },
});

const compositeLayout = tgpu.bindGroupLayout({
  hdr: { texture: d.texture2d(d.f32) },
  bloom: { texture: d.texture2d(d.f32) },
  linear: { sampler: 'filtering' },
});

const postParamsAccess = tgpu.accessor(PostParams);

const hash = (n: number) => {
  'use gpu';
  return std.fract(std.sin(n * 127.1 + 311.7) * 43758.5453);
};

// Hyperspace streaks radiating from the vanishing point.
const warpStreaks = (uv: d.v2f, time: number, aspect: number) => {
  'use gpu';
  const p = (uv - 0.5) * d.vec2f(aspect, 1);
  const r = std.length(p);
  const angle = std.atan2(p.y, p.x);
  let glow = d.f32(0);
  for (const layer of tgpu.unroll([0, 1])) {
    const count = d.f32(90 + layer * 50);
    const slot = std.floor((angle / (Math.PI * 2) + 0.5) * count);
    const seed = hash(slot + layer * 977);
    // Angular distance to the streak's center line, scaled so streaks stay thin.
    const centerAngle = ((slot + 0.5) / count - 0.5) * (Math.PI * 2);
    const angularDist = std.abs(angle - centerAngle) * r * count;
    const head = std.fract(seed * 7 + time * (0.18 + seed * 0.35));
    const along = r - head * 0.9;
    const tail =
      std.smoothstep(0, 0.25 + seed * 0.3, along) * (1 - std.smoothstep(0.3, 0.45, along));
    const line = std.max(0, 1 - angularDist * 6);
    glow += tail * line * (0.3 + seed * 0.7) * std.smoothstep(0.02, 0.25, r);
  }
  return glow;
};

const aces = (x: d.v3f) => {
  'use gpu';
  return std.saturate((x * (x * 2.51 + 0.03)) / (x * (x * 2.43 + 0.59) + 0.14));
};

export function createPostProcessing(
  root: TgpuRoot,
  width: number,
  height: number,
  postParams: TgpuUniform<typeof PostParams>,
) {
  const bloomWidth = Math.max(1, Math.floor(width / 4));
  const bloomHeight = Math.max(1, Math.floor(height / 4));

  const hdrTexture = root
    .createTexture({ size: [width, height], format: 'rgba16float' })
    .$usage('render', 'sampled');
  const bloomA = root
    .createTexture({ size: [bloomWidth, bloomHeight], format: 'rgba16float' })
    .$usage('storage', 'sampled');
  const bloomB = root
    .createTexture({ size: [bloomWidth, bloomHeight], format: 'rgba16float' })
    .$usage('storage', 'sampled');

  const linear = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const downsample = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const size = d.vec2f(std.textureDimensions(blurLayout.$.dst));
    const uv = (d.vec2f(x, y) + 0.5) / size;
    const color = std.textureSampleLevel(blurLayout.$.src, blurLayout.$.linear, uv, 0).rgb;
    // Only the bright, HDR parts of the text bloom.
    const brightness = std.max(std.max(color.r, color.g), color.b);
    const weight = std.max(brightness - 0.9, 0) / std.max(brightness, 1e-4);
    std.textureStore(blurLayout.$.dst, d.vec2u(x, y), d.vec4f(color * weight, 1));
  });

  const createBlur = (direction: d.v2f) =>
    root.createGuardedComputePipeline((x, y) => {
      'use gpu';
      const size = d.vec2f(std.textureDimensions(blurLayout.$.dst));
      const uv = (d.vec2f(x, y) + 0.5) / size;
      const texel = direction / size;
      let sum = d.vec3f();
      let total = d.f32(0);
      for (const i of tgpu.unroll(std.range(-6, 7))) {
        const weight = std.exp(-(i * i) / 14);
        sum +=
          std.textureSampleLevel(blurLayout.$.src, blurLayout.$.linear, uv + texel * i, 0).rgb *
          weight;
        total += weight;
      }
      std.textureStore(blurLayout.$.dst, d.vec2u(x, y), d.vec4f(sum / total, 1));
    });
  const blurHorizontal = createBlur(d.vec2f(1.5, 0));
  const blurVertical = createBlur(d.vec2f(0, 1.5));

  const compositeFragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
    'use gpu';
    const params = postParamsAccess.$;
    const centered = (uv - 0.5) * d.vec2f(params.aspect, 1);
    const dist = std.length(centered);

    // Slight chromatic aberration: the channels are sampled a bit apart,
    // more so towards the edges and at high speed.
    const shift = (uv - 0.5) * dist * (0.004 + params.speed * 0.0008);
    const text = d.vec4f(
      std.textureSample(compositeLayout.$.hdr, compositeLayout.$.linear, uv + shift).r,
      std.textureSample(compositeLayout.$.hdr, compositeLayout.$.linear, uv).g,
      std.textureSample(compositeLayout.$.hdr, compositeLayout.$.linear, uv - shift).b,
      std.textureSample(compositeLayout.$.hdr, compositeLayout.$.linear, uv).a,
    );
    const bloom = std.textureSample(compositeLayout.$.bloom, compositeLayout.$.linear, uv).rgb;

    // Background: a deep gradient plus streaks that get brighter with speed.
    const streaks = warpStreaks(uv, params.time, params.aspect) * std.saturate(params.speed * 0.12);
    let color = std.mix(
      d.vec3f(0.06, 0.03, 0.12),
      d.vec3f(0.01, 0.01, 0.03),
      std.saturate(dist * 1.6),
    );
    color += d.vec3f(0.45, 0.35, 1) * streaks * 0.5;

    // Text is straight-alpha over the background, bloom is additive.
    color = std.mix(color, text.rgb, text.a);
    color += bloom * params.bloomIntensity;

    const vignette = 1 - std.smoothstep(0.45, 1.05, dist);
    return d.vec4f(aces(color * vignette), 1);
  });

  const composite = root.with(postParamsAccess, postParams).createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: compositeFragment,
  });

  const hdrView = hdrTexture.createView(d.texture2d(d.f32));
  const bloomAView = bloomA.createView(d.texture2d(d.f32));
  const bloomBView = bloomB.createView(d.texture2d(d.f32));
  const bloomAStore = bloomA.createView(d.textureStorage2d('rgba16float'));
  const bloomBStore = bloomB.createView(d.textureStorage2d('rgba16float'));

  const downsampleGroup = root.createBindGroup(blurLayout, {
    src: hdrView,
    dst: bloomAStore,
    linear,
  });
  const blurHGroup = root.createBindGroup(blurLayout, {
    src: bloomAView,
    dst: bloomBStore,
    linear,
  });
  const blurVGroup = root.createBindGroup(blurLayout, {
    src: bloomBView,
    dst: bloomAStore,
    linear,
  });
  const compositeGroup = root.createBindGroup(compositeLayout, {
    hdr: hdrView,
    bloom: bloomAView,
    linear,
  });

  return {
    hdrTexture,
    render(target: ColorAttachment['view']) {
      downsample.with(downsampleGroup).dispatchThreads(bloomWidth, bloomHeight);
      blurHorizontal.with(blurHGroup).dispatchThreads(bloomWidth, bloomHeight);
      blurVertical.with(blurVGroup).dispatchThreads(bloomWidth, bloomHeight);
      composite.with(compositeGroup).withColorAttachment({ view: target }).draw(3);
    },
    destroy() {
      hdrTexture.destroy();
      bloomA.destroy();
      bloomB.destroy();
    },
  };
}
