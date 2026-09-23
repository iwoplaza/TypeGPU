import { glyph, slug } from '@pmndrs/glyph';
import { defineTypeGpuConfig, type TypeGpuText } from '@pmndrs/glyph/typegpu';
import { tgpu, d, std } from 'typegpu';
import { mat4 } from 'wgpu-matrix';
import { defineControls } from '../../common/defineControls.ts';
import { createPostProcessing, PostParams } from './post-processing.ts';

// Glyph lays text out on a flat 2D sheet (x right, y down, in pixels).
// We roll that sheet into a tunnel: x becomes depth, y wraps around the walls.
// Because Slug evaluates the glyph curves analytically per pixel, the letters
// stay razor sharp even when viewed at grazing angles right next to the camera.

const PX_PER_UNIT = 180;
const RADIUS = 1;
const LANES = 6;
const LANE_PITCH = (2 * Math.PI * RADIUS * PX_PER_UNIT) / LANES;
const FONT_SIZE = 140;
const WORD_GAP = 120;
const LANE_LENGTH = 34 * PX_PER_UNIT;
const LANE_COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#c77dff', '#ff9f1c'];
const DEFAULT_MESSAGE = `TYPEGPU WEBGPU SLUG ANALYTIC CURVES NO ATLAS @PMNDRS/GLYPH
TYPE-SAFE SHADERS IN TYPESCRIPT RESOLUTION INDEPENDENT BÉZIER GPU TEXT`;

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const TunnelParams = d.struct({
  cameraX: d.f32,
  twist: d.f32,
  roll: d.f32,
  cameraOffset: d.vec2f,
  fogNear: d.f32,
  fogFar: d.f32,
});

const tunnelParams = root.createUniform(TunnelParams, {
  cameraX: 0,
  twist: 0.12,
  roll: 0,
  cameraOffset: d.vec2f(),
  fogNear: 6,
  fogFar: 24,
});
const projection = root.createUniform(d.mat4x4f);
const postParams = root.createUniform(PostParams, {
  time: 0,
  aspect: 1,
  bloomIntensity: 0.9,
  speed: 4,
});

await glyph.init();

// Fonts are loaded before the handle is registered. Handle names are global, so
// a handle left behind by a failed load would make every reload of this example throw.
const fonts = {
  'Bebas Neue': glyph.fontFace('/TypeGPU/assets/glyph/bebas-neue.font.glb', { format: slug }),
  'Inter Bold': glyph.fontFace('/TypeGPU/assets/glyph/inter-bold.font.glb', { format: slug }),
};
try {
  await Promise.all(Object.values(fonts).map((font) => font.load()));
} catch (error) {
  for (const face of Object.values(fonts)) {
    face.dispose();
  }
  throw error;
}

const handle = glyph.handle(
  'slug-text-tunnel',
  defineTypeGpuConfig({
    root,
    // The text is drawn into an HDR texture and post-processed afterwards.
    format: 'rgba16float',
    // Vertex hook: maps a point on the 2D text sheet to clip space.
    transformPosition: (position) => {
      'use gpu';
      const params = tunnelParams.$;
      const depth = (position.x - params.cameraX) / PX_PER_UNIT;
      const angle = position.y / (PX_PER_UNIT * RADIUS) + depth * params.twist + params.roll;
      const wall = d.vec2f(std.cos(angle), std.sin(angle)) * RADIUS - params.cameraOffset;
      // The camera sits at the origin and looks down -Z.
      return projection.$ * d.vec4f(wall, -depth, 1);
    },
    // Fragment hook: fog far away, HDR glow up close.
    transformColor: (color, fragPos) => {
      'use gpu';
      const params = tunnelParams.$;
      // The position builtin stores 1/w, and w is the distance along the view axis.
      const depth = 1 / fragPos.w;
      const fog = 1 - std.smoothstep(params.fogNear, params.fogFar, depth);
      const glow = 1 + 2.5 * std.exp(-depth * 0.4);
      return d.vec4f(color.rgb * glow, color.a * fog);
    },
  }),
);

// #region Words

interface Word {
  text: TypeGpuText;
  lane: number;
  x: number;
  width: number;
}

let font = fonts['Bebas Neue'];
let message = DEFAULT_MESSAGE;
let words: Word[] = [];
let cameraX = 0;
// Where the next recycled word goes, per lane.
const laneEnd = Array.from({ length: LANES }, () => 0);

function placeWord(word: Word, x: number) {
  word.x = x;
  word.text.update({ position: [x, word.lane * LANE_PITCH] });
  laneEnd[word.lane] = x + word.width + WORD_GAP;
}

function buildWords() {
  for (const word of words) {
    word.text.dispose();
  }
  words = [];
  const tokens = message.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return;
  }

  const startX = cameraX + 2 * PX_PER_UNIT;
  laneEnd.fill(startX);
  let token = 0;
  // Fill every lane a fixed distance ahead of the camera. Nothing loops:
  // words that fall behind are recycled to the end of their lane.
  for (let lane = 0; lane < LANES; lane++) {
    // Stagger the lanes so the words don't line up.
    laneEnd[lane] += ((lane * 7919) % 1000) * 0.6;
    while (laneEnd[lane] < startX + LANE_LENGTH) {
      const text = handle.createText({
        font,
        text: tokens[token % tokens.length],
        style: { fontSize: FONT_SIZE, color: LANE_COLORS[lane % LANE_COLORS.length] },
        layout: { wrap: 'none' },
      });
      token++;
      const word: Word = { text, lane, x: 0, width: text.measure().width };
      placeWord(word, laneEnd[lane]);
      words.push(word);
    }
  }
  glyph.shape();
}

// Words that went past the camera get moved to the end of their lane.
function recycleWords() {
  let changed = false;
  for (const word of words) {
    if (word.x + word.width < cameraX - PX_PER_UNIT) {
      placeWord(word, laneEnd[word.lane]);
      changed = true;
    }
  }
  if (changed) {
    glyph.shape();
  }
}

// #endregion

// #region Rendering

// Pipelines are created once, only the textures and bind groups follow the canvas size.
const post = createPostProcessing(root, postParams);

function resize() {
  const { width, height } = canvas;
  if (width === 0 || height === 0) {
    return;
  }
  post.resize(width, height);
  projection.write(mat4.perspective((70 / 180) * Math.PI, width / height, 0.05, 100, d.mat4x4f()));
  postParams.patch({ aspect: width / height });
}
resize();
buildWords();

const pointerTarget = d.vec2f();
const pointer = d.vec2f();
function onPointerMove(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  pointerTarget.x = ((event.clientX - rect.left) / rect.width - 0.5) * 0.5;
  pointerTarget.y = (0.5 - (event.clientY - rect.top) / rect.height) * 0.5;
}
canvas.addEventListener('pointermove', onPointerMove);

// Hold the pointer down to punch it.
let boosting = false;
function onPointerDown() {
  boosting = true;
}
function onPointerUp() {
  boosting = false;
}
canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointerup', onPointerUp);

let speed = 4;
let currentSpeed = 4;
let roll = 0;
let lastTime = 0;

function frame(timestamp: number) {
  frameId = requestAnimationFrame(frame);
  if (canvas.width === 0 || canvas.height === 0) {
    return;
  }
  const dt = lastTime === 0 ? 0 : Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  const targetSpeed = boosting ? speed * 3 + 6 : speed;
  currentSpeed += (targetSpeed - currentSpeed) * Math.min(1, dt * 3);
  cameraX += currentSpeed * PX_PER_UNIT * dt;
  roll += dt * 0.08;
  pointer.x += (pointerTarget.x - pointer.x) * 0.05;
  pointer.y += (pointerTarget.y - pointer.y) * 0.05;
  tunnelParams.patch({ cameraX, roll, cameraOffset: pointer });
  postParams.patch({ time: timestamp / 1000, speed: currentSpeed });
  recycleWords();

  if (!post.isSized(canvas.width, canvas.height)) {
    resize();
  }

  // 1. Glyph draws every word into the HDR texture, in a pass we own.
  const encoder = root['~unstable'].createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: post.hdrTexture, clearValue: [0, 0, 0, 0] }],
  });
  handle.draw(pass, { width: canvas.width, height: canvas.height });
  pass.end();
  encoder.submit();

  // 2. Bloom + background + tone mapping, straight to the canvas.
  post.render(context);
}
let frameId = requestAnimationFrame(frame);

// #endregion

// #region Example controls and cleanup

export const controls = defineControls({
  Message: {
    initial: DEFAULT_MESSAGE,
    onTextChange(value: string) {
      message = value;
      buildWords();
    },
  },
  Font: {
    initial: 'Bebas Neue',
    options: Object.keys(fonts) as (keyof typeof fonts)[],
    onSelectChange(value) {
      font = fonts[value];
      // Word widths depend on the font, so the tunnel is refilled.
      buildWords();
    },
  },
  Speed: {
    initial: 4,
    min: 0,
    max: 12,
    step: 0.5,
    onSliderChange(value: number) {
      speed = value;
    },
  },
  Twist: {
    initial: 0.12,
    min: -0.5,
    max: 0.5,
    step: 0.01,
    onSliderChange(value: number) {
      tunnelParams.patch({ twist: value });
    },
  },
  Bloom: {
    initial: 0.9,
    min: 0,
    max: 2,
    step: 0.1,
    onSliderChange(value: number) {
      postParams.patch({ bloomIntensity: value });
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  canvas.removeEventListener('pointermove', onPointerMove);
  canvas.removeEventListener('pointerdown', onPointerDown);
  window.removeEventListener('pointerup', onPointerUp);
  for (const word of words) {
    word.text.dispose();
  }
  handle.dispose();
  for (const face of Object.values(fonts)) {
    face.dispose();
  }
  post.destroy();
  root.destroy();
}

// #endregion
