import { tgpu, d, std } from 'typegpu/$built$';

const root = await tgpu.init();
const values = root.createMutable(d.arrayOf(d.f32, 64));

const pipeline = root.createGuardedComputePipeline((i) => {
  'use gpu';
  values.$[i] = std.sqrt(d.f32(i));
});

pipeline.dispatchThreads(64);
console.log(await values.read());
