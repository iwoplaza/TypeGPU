import { tgpu, d, std } from 'typegpu/$built$';

const Params = d.struct({ time: d.f32, tint: d.vec4f });

const positions = tgpu.const(d.arrayOf(d.vec2f, 3), [
  d.vec2f(0, 0.5),
  d.vec2f(-0.5, -0.5),
  d.vec2f(0.5, -0.5),
]);

const root = await tgpu.init();
const params = root.createUniform(Params);

const pipeline = root.createRenderPipeline({
  vertex: ({ $vertexIndex }) => {
    'use gpu';
    return { $position: d.vec4f(positions.$[$vertexIndex], 0, 1) };
  },
  fragment: () => {
    'use gpu';
    return std.mix(params.$.tint, d.vec4f(1), std.sin(params.$.time));
  },
});

const context = root.configureContext({ canvas: document.querySelector('canvas') });
params.write({ time: performance.now() / 1000, tint: d.vec4f(1, 0, 0, 1) });
pipeline.withColorAttachment({ view: context }).draw(3);
