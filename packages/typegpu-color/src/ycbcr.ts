import { tgpu } from 'typegpu';
import { mat3x3f, vec3f } from 'typegpu/data';
import { mul } from 'typegpu/std';

/**
 * Converts RGB to Y, Cb and Cr with the BT.601 coefficients, when used as `mul(rgb, rgbToYcbcrMatrix)`.
 * For RGB in [0, 1], Y is in [0, 1], while Cb and Cr are centered at 0 and lie in [-0.5, 0.5]
 * (YPbPr-style), without the 0.5 offset that YCbCr usually implies.
 *
 * @example
 * import { rgbToYcbcrMatrix } from '@typegpu/color';
 *
 * const redInYcbcr = mul(d.vec3f(1, 0, 0), rgbToYcbcrMatrix);
 */
export const rgbToYcbcrMatrix = tgpu.const(
  mat3x3f,
  mat3x3f(
    // column 1 (Y)
    0.299,
    0.587,
    0.114,
    // column 2 (Cb)
    -0.168736,
    -0.331264,
    0.5,
    // column 3 (Cr)
    0.5,
    -0.418688,
    -0.081312,
  ),
);

/**
 * For RGB in [0, 1], Y is in [0, 1], while Cb and Cr are centered at 0 and lie in [-0.5, 0.5].
 * @see rgbToYcbcrMatrix
 */
export const rgbToYcbcr = tgpu.fn([vec3f], vec3f)((rgb) => mul(rgb, rgbToYcbcrMatrix.$));
