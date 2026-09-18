import { tgpu, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const PARTICLE_COUNT = 2500;

// #region Particle data

const Particle = d.struct({
  position: d.vec2f, // in clip space, -1..1
  velocity: d.vec2f,
  color: d.vec3f,
  size: d.f32,
});

function randomParticle(): d.Infer<typeof Particle> {
  const hue = Math.random() * Math.PI * 2;
  return {
    position: d.vec2f(Math.random() * 2 - 1, Math.random() * 2 - 1),
    velocity: d.vec2f((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4),
    color: d.vec3f(
      0.6 + 0.4 * Math.cos(hue),
      0.6 + 0.4 * Math.cos(hue + 2.1),
      0.6 + 0.4 * Math.cos(hue + 4.2),
    ),
    size: 0.004 + Math.random() * 0.016,
  };
}

// The same buffer is written by the compute shader and read as per-instance
// vertex data by the render pipeline.
const particleBuffer = root
  .createBuffer(
    d.arrayOf(Particle, PARTICLE_COUNT),
    Array.from({ length: PARTICLE_COUNT }, randomParticle),
  )
  .$usage('storage', 'vertex');

const particles = particleBuffer.as('mutable');
// 'instance' step mode: every instance gets the next element instead of every vertex.
const instanceLayout = tgpu.vertexLayout(d.arrayOf(Particle), 'instance');

// #endregion

// #region Simulation

const Params = d.struct({
  deltaTime: d.f32,
  time: d.f32,
  aspect: d.f32,
  speed: d.f32,
});
const params = root.createUniform(Params, { deltaTime: 0, time: 0, aspect: 1, speed: 1 });

// One thread per particle. The guard makes sure we never run past the array.
const simulate = root.createGuardedComputePipeline((index: number) => {
  'use gpu';
  const p = particles.$[index];
  // A gentle swirling current, plus the particle's own velocity.
  const swirl = d.vec2f(-p.position.y, p.position.x) * 0.15;
  const drift =
    d.vec2f(
      std.sin(params.$.time + p.position.y * 3),
      std.cos(params.$.time * 0.7 + p.position.x * 3),
    ) * 0.1;
  let position = p.position + (p.velocity + swirl + drift) * params.$.deltaTime * params.$.speed;
  // Wrap around the edges of the screen.
  position = std.fract((position + 1) * 0.5) * 2 - 1;
  particles.$[index].position = d.vec2f(position);
});

// #endregion

// #region Rendering

const pipeline = root.createRenderPipeline({
  attribs: instanceLayout.attrib,
  vertex: ({ $vertexIndex: vertexIndex, position, color, size }) => {
    'use gpu';
    // Six vertices per instance form a quad, without any vertex buffer for them.
    const corner = d.vec2f(
      std.select(-1, 1, vertexIndex === 1 || vertexIndex === 4 || vertexIndex === 5),
      std.select(-1, 1, vertexIndex === 2 || vertexIndex === 3 || vertexIndex === 5),
    );
    const offset = corner * size * d.vec2f(1 / params.$.aspect, 1);
    return {
      $position: d.vec4f(position + offset, 0, 1),
      uv: corner,
      color,
    };
  },
  fragment: ({ uv, color }) => {
    'use gpu';
    // A soft disc, using the distance from the quad's center.
    const dist = std.length(uv);
    const alpha = 1 - std.smoothstep(0.7, 1, dist);
    return d.vec4f(color * 0.8, alpha * 0.8);
  },
  targets: {
    format: navigator.gpu.getPreferredCanvasFormat(),
    blend: {
      color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    },
  },
});

let lastTime = 0;
function frame(timestamp: number) {
  frameId = requestAnimationFrame(frame);
  if (canvas.width === 0 || canvas.height === 0) {
    return;
  }
  const deltaTime = lastTime === 0 ? 0 : Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;
  params.patch({ deltaTime, time: timestamp / 1000, aspect: canvas.width / canvas.height });

  simulate.dispatchThreads(PARTICLE_COUNT);

  pipeline
    .with(instanceLayout, particleBuffer)
    .withColorAttachment({ view: context, clearValue: [0.03, 0.03, 0.06, 1] })
    // 6 vertices, drawn once per particle.
    .draw(6, PARTICLE_COUNT);
}
let frameId = requestAnimationFrame(frame);

// #endregion

// #region Example controls and cleanup

export const controls = defineControls({
  Speed: {
    initial: 1,
    min: 0,
    max: 5,
    step: 0.1,
    onSliderChange(value: number) {
      params.patch({ speed: value });
    },
  },
  Reset: {
    onButtonClick() {
      particleBuffer.write(Array.from({ length: PARTICLE_COUNT }, randomParticle));
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}

// #endregion
