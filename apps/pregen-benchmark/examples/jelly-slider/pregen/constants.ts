/**
 * Plain-number constants shared by the build-time shaders (./shaders.ts) and the
 * raw WebGPU host code. Must not import TypeGPU, as it ends up in the browser bundle.
 */

// Rendering constants
export const MAX_STEPS = 64;
export const MAX_DIST = 10;
export const SURF_DIST = 0.001;

// Lighting constants
export const AMBIENT_INTENSITY = 0.6;
export const SPECULAR_POWER = 10;
export const SPECULAR_INTENSITY = 0.6;

// Jelly material constants
export const JELLY_IOR = 1.42;
export const JELLY_SCATTER_STRENGTH = 3;

// Ambient occlusion constants
export const AO_STEPS = 3;
export const AO_RADIUS = 0.1;
export const AO_INTENSITY = 0.5;
export const AO_BIAS = SURF_DIST * 5;

// Line/slider constants
export const LINE_RADIUS = 0.024;
export const LINE_HALF_THICK = 0.17;

// Mouse interaction constants
export const MOUSE_SMOOTHING = 0.08;
export const MOUSE_MIN_X = 0.45;
export const MOUSE_MAX_X = 0.9;
export const MOUSE_RANGE_MIN = 0.4;
export const MOUSE_RANGE_MAX = 0.9;
export const TARGET_MIN = -0.7;
export const TARGET_MAX = 1.0;
export const TARGET_OFFSET = -0.5;

// Slider geometry. The runtime variant passes these through `d.vec2f`, which
// rounds to f32, so the same rounding is applied here.
export const NUM_POINTS = 17;
export const SLIDER_START = [Math.fround(-1), Math.fround(0)] as const;
export const SLIDER_END = [Math.fround(0.9), Math.fround(0)] as const;
export const SLIDER_Y_OFFSET = -0.03;
export const SLIDER_TOTAL_LENGTH = Math.hypot(
  SLIDER_END[0] - SLIDER_START[0],
  SLIDER_END[1] - SLIDER_START[1],
);
const BBOX_PADDING = 0.01;
export const SLIDER_BBOX = {
  left: SLIDER_START[0] - SLIDER_TOTAL_LENGTH * BBOX_PADDING,
  right: SLIDER_END[0] + SLIDER_TOTAL_LENGTH * BBOX_PADDING * 10,
  bottom: -0.3,
  top: 0.65,
};
export const BEZIER_TEXTURE_SIZE = [256, 128] as const;

// Workgroup sizes of the compute entry points in ./shaders.ts
export const BEZIER_WORKGROUP_SIZE = [16, 16] as const;
export const TAA_WORKGROUP_SIZE = [16, 16] as const;
