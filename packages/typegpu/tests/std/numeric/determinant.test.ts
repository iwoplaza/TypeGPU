import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('determinant', () => {
  it('computes the determinant of mat2x2f', () => {
    expect(std.determinant(d.mat2x2f(1, 2, 3, 4))).toBe(-2);
    expect(std.determinant(d.mat2x2f.identity())).toBe(1);
  });

  it('computes the determinant of mat3x3f', () => {
    expect(std.determinant(d.mat3x3f(2, 0, 1, 1, 3, 2, 1, 1, 2))).toBe(6);
    expect(std.determinant(d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9))).toBe(0);
    expect(std.determinant(d.mat3x3f.identity())).toBe(1);
  });

  it('computes the determinant of mat4x4f', () => {
    expect(std.determinant(d.mat4x4f(1, 0, 2, -1, 3, 0, 0, 5, 2, 1, 4, -3, 1, 0, 5, 0))).toBe(30);
    expect(std.determinant(d.mat4x4f.identity())).toBe(1);
    expect(std.determinant(d.mat4x4f.scaling(d.vec3f(2, 3, 4)))).toBe(24);
  });

  it('is invariant under transposition', () => {
    const m = d.mat4x4f(3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3);
    expect(std.determinant(m)).toBe(98);
    expect(std.determinant(std.transpose(m))).toBe(98);
  });
});
