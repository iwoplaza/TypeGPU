import { describe, expect, it } from 'vitest';
import { d, tgpu } from 'typegpu';
import { linearRgbToOklab, oklabGamutClip, oklabToLinearRgb } from '../src/index.ts';

describe.each(Object.entries(oklabGamutClip))('oklabGamutClip.%s', (_, clip) => {
  it('resolves to WGSL', () => {
    expect(() => tgpu.resolve([clip])).not.toThrow();
  });

  it('keeps achromatic colors gray', () => {
    for (const L of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(clip(d.vec3f(L, 0, 0))).toStrictEqual(d.vec3f(L, 0, 0));
    }
  });

  it('keeps black and white', () => {
    expect(clip(d.vec3f(0, 0, 0))).toStrictEqual(d.vec3f(0, 0, 0));
    expect(clip(d.vec3f(1, 0, 0))).toStrictEqual(d.vec3f(1, 0, 0));
  });

  it('clamps the lightness of achromatic colors outside of the gamut', () => {
    expect(clip(d.vec3f(1.5, 0, 0))).toStrictEqual(d.vec3f(1, 0, 0));
    expect(clip(d.vec3f(-0.5, 0, 0))).toStrictEqual(d.vec3f(0, 0, 0));
  });

  it('leaves colors that are already in gamut unchanged', () => {
    for (const rgb of [
      d.vec3f(0.2, 0.5, 0.8),
      d.vec3f(0.9, 0.05, 0.05),
      d.vec3f(0.02, 0.9, 0.05),
    ]) {
      const lab = linearRgbToOklab(rgb);
      expect(clip(lab)).toStrictEqual(lab);
    }
  });
});

// The adaptive methods read `oklabGamutClipAlphaAccess`, which can't be accessed on the CPU,
// so only `preserveChroma` can be checked with an out-of-gamut color here.
describe('oklabGamutClip.preserveChroma', () => {
  it('brings out-of-gamut colors into the gamut, preserving hue', () => {
    // A more saturated red than sRGB can represent
    const lab = d.vec3f(0.6, 0.3, 0.15);
    const before = oklabToLinearRgb(lab);
    expect(Math.min(before.x, before.y, before.z)).toBeLessThan(0);

    const result = oklabGamutClip.preserveChroma(lab);
    const rgb = oklabToLinearRgb(result);
    for (const c of [rgb.x, rgb.y, rgb.z]) {
      expect(c).toBeGreaterThanOrEqual(-1e-3);
      expect(c).toBeLessThanOrEqual(1 + 1e-3);
    }
    expect(result.x).toBeCloseTo(lab.x, 5);
    expect(Math.atan2(result.z, result.y)).toBeCloseTo(Math.atan2(lab.z, lab.y), 5);
  });
});
