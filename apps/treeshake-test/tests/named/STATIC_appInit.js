import { tgpu, d } from 'typegpu/$built$';

const root = await tgpu.init();
const buffer = root.createBuffer(d.arrayOf(d.f32, 4), [1, 2, 3, 4]).$usage('storage');

console.log(await buffer.read());
