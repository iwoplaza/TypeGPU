import { glyph, slug } from '@pmndrs/glyph';
import { defineTypeGpuConfig } from '@pmndrs/glyph/typegpu';
import * as rc from '@typegpu/radiance-cascades';
import * as sdf from '@typegpu/sdf';
import { tgpu, common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

// Every frame:
//   1. Glyph draws text into a "scene" texture. Bright text emits light,
//      dark text only blocks it. A lamp that follows the pointer is drawn
//      into the same render pass by a regular TypeGPU pipeline.
//   2. @typegpu/sdf turns that texture into a signed distance field.
//   3. @typegpu/radiance-cascades bounces light around the letters.
//   4. A fullscreen pass composes the lit scene.

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const Params = d.struct({
  time: d.f32,
  intensity: d.f32,
  animateHue: d.u32,
  displayMode: d.u32,
  resolution: d.vec2f,
  lampPos: d.vec2f, // in pixels
  lampRadius: d.f32,
  lampColor: d.vec3f,
});

const params = root.createUniform(Params, {
  time: 0,
  intensity: 3,
  animateHue: 1,
  displayMode: 0,
  resolution: d.vec2f(1),
  lampPos: d.vec2f(),
  lampRadius: 24,
  lampColor: d.vec3f(1, 0.85, 0.6),
});

const linearSampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });

const hueColor = (phase: number) => {
  'use gpu';
  return std.cos(d.vec3f(phase, phase + 2.1, phase + 4.2)) * 0.5 + 0.5;
};

// #region Text

await glyph.init();

const handle = glyph.handle(
  'text-radiance-cascades',
  defineTypeGpuConfig({
    root,
    format: 'rgba16float',
    transformColor: (color, fragPos) => {
      'use gpu';
      // White text becomes neon that slowly cycles through hues, dark text is
      // left as it is. The alpha channel marks the pixel as solid for the SDF.
      const emissive = std.step(0.5, color.r);
      const phase = fragPos.x * 0.003 + params.$.time * d.f32(params.$.animateHue) * 0.4;
      const neon = std.mix(hueColor(phase), d.vec3f(1), 0.15) * 0.6;
      return d.vec4f(std.mix(color.rgb, neon, emissive), color.a);
    },
  }),
);

const font = glyph.fontFace('/TypeGPU/assets/glyph/inter-bold.font.glb', { format: slug });
await font.load();

const headline = handle.createText({
  font,
  text: 'RADIANCE',
  style: { fontSize: 160, letterSpacing: 4, color: '#ffffff' },
  layout: { align: 'center', wrap: 'none' },
});

const body = handle.createText({
  font,
  text: 'Letters cast shadows. Move the lamp around and watch the light bounce between the glyphs.',
  style: { fontSize: 36, lineHeight: 1.25, color: '#06060c' },
  layout: { align: 'center' },
});

function layoutTexts() {
  const { width, height } = canvas;
  const headlineSize = Math.min(220, width / 6);
  headline.update({
    style: { fontSize: headlineSize, letterSpacing: headlineSize * 0.03, color: '#ffffff' },
    constraints: { width: { mode: 'exact', size: width } },
  });
  body.update({
    style: { fontSize: headlineSize * 0.24, lineHeight: 1.25, color: '#06060c' },
    constraints: { width: { mode: 'exact', size: width * 0.7 } },
  });
  const headlineHeight = headline.measure().height;
  const bodyHeight = body.measure().height;
  const gap = headlineSize * 0.25;
  const top = (height - headlineHeight - gap - bodyHeight) / 2;
  headline.update({ position: [0, top] });
  body.update({ position: [width * 0.15, top + headlineHeight + gap] });
  glyph.shape();
}

// #endregion

// #region Lamp

const sceneLayout = tgpu.bindGroupLayout({
  scene: { texture: d.texture2d(d.f32) },
});

// A soft, bright disc that follows the pointer. It is drawn into the same
// render pass as the text, so it becomes a light source just like the letters.
const lampPipeline = root.createRenderPipeline({
  vertex: ({ $vertexIndex: index }) => {
    'use gpu';
    const corner = d.vec2f(d.f32(index & 1), d.f32((index >>> 1) & 1)) * 2 - 1;
    const pixel = params.$.lampPos + corner * params.$.lampRadius;
    const clip = (pixel / params.$.resolution) * 2 - 1;
    return { $position: d.vec4f(clip.x, -clip.y, 0, 1), local: corner };
  },
  fragment: ({ local }) => {
    'use gpu';
    const dist = std.length(local);
    const alpha = 1 - std.smoothstep(0.85, 1, dist);
    return d.vec4f(params.$.lampColor, alpha);
  },
  primitive: { topology: 'triangle-strip' },
  targets: {
    format: 'rgba16float',
    blend: {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    },
  },
});

// #endregion

// #region Lighting

const displayLayout = tgpu.bindGroupLayout({
  sdf: { texture: d.texture2d(d.f32) },
  seed: { texture: d.texture2d(d.f32) },
  radiance: { texture: d.texture2d(d.f32) },
});

const aces = (x: d.v3f) => {
  'use gpu';
  return std.saturate((x * (x * 2.51 + 0.03)) / (x * (x * 2.43 + 0.59) + 0.14));
};

const displayPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
    'use gpu';
    const signedDist = std.textureSample(displayLayout.$.sdf, linearSampler.$, uv).x;

    if (params.$.displayMode === 1) {
      const bands = std.abs(std.fract(signedDist * 30) - 0.5) * 2;
      const tint = std.select(d.vec3f(0.2, 0.5, 1), d.vec3f(1, 0.4, 0.2), signedDist < 0);
      return d.vec4f(tint * (0.3 + 0.7 * bands) * std.exp(-std.abs(signedDist) * 3), 1);
    }

    const seed = std.textureSample(displayLayout.$.seed, linearSampler.$, uv).rgb;
    const radiance = std.textureSample(displayLayout.$.radiance, linearSampler.$, uv).rgb;
    const texel = 1 / d.f32(std.textureDimensions(displayLayout.$.sdf).y);
    const edge = std.max(std.fwidth(signedDist), texel);
    const surface = 1 - std.smoothstep(-edge, edge, signedDist);
    // Emitters glow with their own color, occluders show their dark surface.
    const color = std.mix(radiance, seed * params.$.intensity, surface);
    return d.vec4f(aces(color), 1);
  }),
  targets: { format: presentationFormat },
});

function createSizedResources(width: number, height: number) {
  const sceneTexture = root
    .createTexture({ size: [width, height], format: 'rgba16float' })
    .$usage('render', 'sampled');
  const sceneView = sceneTexture.createView(d.texture2d(d.f32));
  const sceneGroup = root.createBindGroup(sceneLayout, { scene: sceneView });

  const flood = sdf
    .createJumpFlood({
      root,
      size: { width, height },
      classify: (coord) => {
        'use gpu';
        return std.textureLoad(sceneLayout.$.scene, d.vec2i(coord), 0).a > 0.5;
      },
      getSdf: (_coord, size, signedDist) => {
        'use gpu';
        return signedDist / d.f32(std.min(size.x, size.y));
      },
      getColor: (_coord, _size, _signedDist, insidePx) => {
        'use gpu';
        return d.vec4f(std.textureLoad(sceneLayout.$.scene, d.vec2i(insidePx), 0).rgb, 1);
      },
    })
    .with(sceneGroup);

  const sdfView = flood.sdfOutput.createView(d.texture2d(d.f32));
  const seedView = flood.colorOutput.createView(d.texture2d(d.f32));

  const radiance = rc.createRadianceCascades({
    root,
    size: {
      width: Math.max(16, Math.floor(width / 4)),
      height: Math.max(16, Math.floor(height / 4)),
    },
    sdfResolution: { width, height },
    sdf: (uv) => {
      'use gpu';
      if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) {
        return 1;
      }
      return std.textureSampleLevel(sdfView.$, linearSampler.$, uv, 0).x;
    },
    // The seed colors are stored as 8-bit, so the HDR intensity is applied here.
    color: (uv) => {
      'use gpu';
      return std.textureSampleLevel(seedView.$, linearSampler.$, uv, 0).rgb * params.$.intensity;
    },
  });

  const displayGroup = root.createBindGroup(displayLayout, {
    sdf: sdfView,
    seed: seedView,
    radiance: radiance.output.createView(d.texture2d(d.f32)),
  });

  flood.initSync();
  radiance.initSync();

  return {
    width,
    height,
    sceneTexture,
    flood,
    radiance,
    displayGroup,
    destroy() {
      flood.destroy();
      radiance.destroy();
      sceneTexture.destroy();
    },
  };
}

let sized = createSizedResources(canvas.width, canvas.height);

// #endregion

// #region Frame loop

const pointer = { x: 0, y: 0, active: false };
function onPointerMove(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  pointer.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  pointer.active = true;
}
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerleave', () => {
  pointer.active = false;
});

layoutTexts();

function frame(timestamp: number) {
  const time = timestamp / 1000;
  if (canvas.width !== sized.width || canvas.height !== sized.height) {
    sized.destroy();
    sized = createSizedResources(canvas.width, canvas.height);
    layoutTexts();
  }

  // Until the pointer shows up, the lamp orbits the headline on its own.
  const lampPos = pointer.active
    ? d.vec2f(pointer.x, pointer.y)
    : d.vec2f(
        canvas.width * (0.5 + 0.38 * Math.sin(time * 0.5)),
        canvas.height * (0.5 + 0.25 * Math.sin(time * 0.9 + 1)),
      );
  params.patch({
    time,
    lampPos,
    lampRadius: canvas.width * 0.018,
    resolution: d.vec2f(canvas.width, canvas.height),
  });

  // 1. Text + lamp into the scene texture.
  const encoder = root['~unstable'].createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: sized.sceneTexture, clearValue: [0, 0, 0, 0] }],
  });
  lampPipeline.with(pass).draw(4);
  handle.draw(pass, { width: canvas.width, height: canvas.height });
  pass.end();
  encoder.submit();

  // 2. Distance field, 3. global illumination, 4. final composite.
  sized.flood.run();
  sized.radiance.run();
  displayPipeline.with(sized.displayGroup).withColorAttachment({ view: context }).draw(3);

  frameId = requestAnimationFrame(frame);
}
let frameId = requestAnimationFrame(frame);

// #endregion

// #region Example controls and cleanup

export const controls = defineControls({
  Headline: {
    initial: 'RADIANCE',
    onTextChange(value: string) {
      headline.update({ text: value });
      layoutTexts();
    },
  },
  Body: {
    initial:
      'Letters cast shadows. Move the lamp around and watch the light bounce between the glyphs.',
    onTextChange(value: string) {
      body.update({ text: value });
      layoutTexts();
    },
  },
  Intensity: {
    initial: 3,
    min: 0.5,
    max: 8,
    step: 0.1,
    onSliderChange(value: number) {
      params.patch({ intensity: value });
    },
  },
  'Lamp Color': {
    initial: d.vec3f(1, 0.85, 0.6),
    onColorChange(value: d.v3f) {
      params.patch({ lampColor: value });
    },
  },
  'Animate Hue': {
    initial: true,
    onToggleChange(value: boolean) {
      params.patch({ animateHue: value ? 1 : 0 });
    },
  },
  Display: {
    initial: 'Radiance',
    options: ['Radiance', 'Distance field'],
    onSelectChange(value: string) {
      params.patch({ displayMode: value === 'Radiance' ? 0 : 1 });
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  canvas.removeEventListener('pointermove', onPointerMove);
  headline.dispose();
  body.dispose();
  handle.dispose();
  font.dispose();
  sized.destroy();
  root.destroy();
}

// #endregion
