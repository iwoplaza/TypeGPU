import { bool } from '../data/numeric.ts';
import { snip } from '../data/snippet.ts';
import { WgslTypeError } from '../errors.ts';
import { $gpuCallable } from '../shared/symbols.ts';
import { type DualFn, isKnownAtComptime as isSnippetKnownAtComptime } from '../types.ts';

const impl = ((_value: unknown) => true) as DualFn<(value: unknown) => boolean>;
impl.toString = () => 'isKnownAtComptime';
impl[$gpuCallable] = {
  call(_ctx, [value]) {
    if (!value) {
      throw new WgslTypeError('`isKnownAtComptime` was called without any arguments');
    }

    return snip(
      isSnippetKnownAtComptime(value),
      bool,
      /* origin */ 'constant',
      /* possibleSideEffects */ false,
    );
  },
};

/**
 * Returns `true` if the passed-in value is computable at compile time, `false` otherwise.
 *
 * During normal JavaScript execution every value is available right away, so this always
 * returns `true`. During code generation, it returns `true` only if the value of the
 * provided snippet is determinable at compile time.
 *
 * Since the answer itself is always known at comptime, branching on it is resolved during
 * generation, and only the taken branch ends up in the shader. That makes it a good fit for
 * opting into optimizations that are only valid when a value is statically known, such as
 * unrolling a loop whose iteration count depends on the length of an array.
 *
 * @example
 * ```ts
 * const layout = tgpu.bindGroupLayout({
 *   // Swapping this for `d.arrayOf(d.vec2f)` (a runtime-sized array)
 *   // makes the loop below stay a loop.
 *   boids: { storage: d.arrayOf(d.vec2f, 3) },
 * });
 *
 * const centroid = tgpu.fn([], d.vec2f)(() => {
 *   let sum = d.vec2f();
 *
 *   for (
 *     const boid of isKnownAtComptime(layout.$.boids.length)
 *       ? tgpu.unroll(layout.$.boids)
 *       : layout.$.boids
 *   ) {
 *     sum = std.add(sum, boid);
 *   }
 *
 *   return sum.div(d.f32(layout.$.boids.length));
 * });
 * ```
 *
 * Generates:
 *
 * ```wgsl
 * @group(0) @binding(0) var<storage, read> boids: array<vec2f, 3>;
 *
 * fn centroid() -> vec2f {
 *   var sum = vec2f();
 *   // unrolled iteration #0
 *   sum = (sum + boids[0u]);
 *   // unrolled iteration #1
 *   sum = (sum + boids[1u]);
 *   // unrolled iteration #2
 *   sum = (sum + boids[2u]);
 *   // ---
 *   return (sum / 3f);
 * }
 * ```
 *
 * @note
 * Only the *value* of the argument is inspected, the expression itself is not emitted into
 * the generated shader, so avoid passing expressions with side effects.
 */
export const isKnownAtComptime = impl;
