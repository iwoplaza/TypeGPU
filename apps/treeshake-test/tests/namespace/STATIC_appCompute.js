import { tgpu } from 'typegpu/$built$';
import * as d from 'typegpu/data/$built$';
import * as std from 'typegpu/std/$built$';

const root = await tgpu.init();
const values = root.createMutable(d.arrayOf(d.f32, 64));

const pipeline = root.createGuardedComputePipeline((i) => {
  'use gpu';
  values.$[i] = std.sqrt(d.f32(i));
});

pipeline.dispatchThreads(64);
console.log(await values.read());
