import { describe, expect, it } from 'vitest';
import { d, tgpu } from 'typegpu';
import { hsvToRgb, rgbToHsv } from '../src/index.ts';

function expectVecCloseTo(actual: d.v3f, expected: d.v3f) {
  expect(actual.x).toBeCloseTo(expected.x, 5);
  expect(actual.y).toBeCloseTo(expected.y, 5);
  expect(actual.z).toBeCloseTo(expected.z, 5);
}

describe('hsvToRgb', () => {
  it('resolves to WGSL', () => {
    expect(() => tgpu.resolve([hsvToRgb])).not.toThrow();
  });

  it('converts hues in [0, 1]', () => {
    expect(hsvToRgb(d.vec3f(0, 1, 1))).toStrictEqual(d.vec3f(1, 0, 0));
    expectVecCloseTo(hsvToRgb(d.vec3f(1 / 3, 1, 1)), d.vec3f(0, 1, 0));
    expectVecCloseTo(hsvToRgb(d.vec3f(2 / 3, 1, 1)), d.vec3f(0, 0, 1));
    expect(hsvToRgb(d.vec3f(1, 1, 1))).toStrictEqual(d.vec3f(1, 0, 0));
    expectVecCloseTo(hsvToRgb(d.vec3f(1 / 12, 1, 1)), d.vec3f(1, 0.5, 0));
    expectVecCloseTo(hsvToRgb(d.vec3f(0.75, 0.5, 0.8)), d.vec3f(0.6, 0.4, 0.8));
    expect(hsvToRgb(d.vec3f(0.3, 0, 0.5))).toStrictEqual(d.vec3f(0.5, 0.5, 0.5));
  });

  it('wraps hues outside of [0, 1]', () => {
    for (let i = -24; i <= 24; i++) {
      const hue = i / 8 + 1 / 16;
      const wrapped = hue - Math.floor(hue);
      expectVecCloseTo(hsvToRgb(d.vec3f(hue, 0.75, 0.9)), hsvToRgb(d.vec3f(wrapped, 0.75, 0.9)));
    }
  });

  it('wraps negative hues', () => {
    expect(hsvToRgb(d.vec3f(-0.25, 1, 1))).toStrictEqual(hsvToRgb(d.vec3f(0.75, 1, 1)));
    expectVecCloseTo(hsvToRgb(d.vec3f(-1 / 3, 1, 1)), d.vec3f(0, 0, 1));
  });
});

describe('rgbToHsv', () => {
  it('round trips through hsvToRgb', () => {
    for (let i = 0; i < 24; i++) {
      const hsv = d.vec3f(i / 24, 0.75, 0.9);
      expectVecCloseTo(rgbToHsv(hsvToRgb(hsv)), hsv);
    }

    for (const rgb of [d.vec3f(0.2, 0.5, 0.8), d.vec3f(1, 0, 0), d.vec3f(0.9, 0.9, 0.1)]) {
      expectVecCloseTo(hsvToRgb(rgbToHsv(rgb)), rgb);
    }
  });
});
