import { glyph, msdf } from '@pmndrs/glyph';
import { defineTypeGpuConfig } from '@pmndrs/glyph/typegpu';
import { tgpu, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

// Regular TypeGPU resources can be read from Glyph's shader hooks.
const timeUniform = root.createUniform(d.f32);

// 1. Start the Glyph engine (text shaping and layout, powered by WASM).
await glyph.init();

// 2. Route Glyph's rendering through our TypeGPU root. The optional
//    `transformColor` hook is a plain 'use gpu' function that runs per fragment.
const handle = glyph.handle(
  'simple-glyph-text',
  defineTypeGpuConfig({
    root,
    format: navigator.gpu.getPreferredCanvasFormat(),
    transformColor: (color, fragPos) => {
      'use gpu';
      // A rainbow sweeping across the screen. `color.a` is the glyph coverage,
      // so we keep it intact to preserve the anti-aliased edges.
      const phase = fragPos.x * 0.004 - timeUniform.$ * 2;
      const rainbow = std.cos(d.vec3f(phase, phase + 2.1, phase + 4.2)) * 0.5 + 0.5;
      return d.vec4f(std.mix(color.rgb, rainbow, color.a), color.a);
    },
  }),
);

// 3. Load a font baked with `glyph bake` (MSDF atlas + metrics in one .glb).
//    The raster options have to match the ones the font was baked with.
const inter = glyph.fontFace('/TypeGPU/assets/glyph/inter-regular.font.glb', {
  format: msdf({ emSize: 32, pixelRange: 4 }),
});
await inter.load();

// 4. Create retained text. Positions are in pixels, origin at the top-left corner.
const title = handle.createText({
  font: inter,
  text: 'Hello, TypeGPU!',
  style: { fontSize: 96, lineHeight: 1.1, color: '#ffffff' },
  layout: { align: 'center' },
});

const subtitle = handle.createText({
  font: inter,
  text: 'Text shaped and rendered by @pmndrs/glyph.',
  style: { fontSize: 28, color: '#8c92b5' },
  layout: { align: 'center' },
});

function layoutTexts() {
  const { width, height } = canvas;
  // Constraining the width lets `align: 'center'` do the centering for us.
  const constraints = { width: { mode: 'exact', size: width } } as const;
  const titleSize = Math.min(120, width / 8);
  title.update({ constraints, style: { fontSize: titleSize, lineHeight: 1.1, color: '#ffffff' } });
  subtitle.update({ constraints, style: { fontSize: titleSize * 0.3, color: '#8c92b5' } });

  // Measuring gives us the laid out size, so we can stack the two texts.
  const titleHeight = title.measure().height;
  const subtitleHeight = subtitle.measure().height;
  const top = (height - titleHeight - subtitleHeight) / 2;
  title.update({ position: [0, top] });
  subtitle.update({ position: [0, top + titleHeight + 8] });

  // `shape()` lays out every text that changed since the last call.
  glyph.shape();
}
layoutTexts();

// 5. Draw. Glyph records into a caller-owned render pass, so other TypeGPU
//    pipelines can draw into the same pass before or after the text.
function frame(timestamp: number) {
  timeUniform.write(timestamp / 1000);

  const encoder = root['~unstable'].createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: context, clearValue: [0.06, 0.06, 0.1, 1] }],
  });
  handle.draw(pass, { width: canvas.width, height: canvas.height });
  pass.end();
  encoder.submit();

  frameId = requestAnimationFrame(frame);
}
let frameId = requestAnimationFrame(frame);

// #region Example controls and cleanup

const resizeObserver = new ResizeObserver(layoutTexts);
resizeObserver.observe(canvas);

export const controls = defineControls({
  Text: {
    initial: 'Hello, TypeGPU!',
    onTextChange(value: string) {
      title.update({ text: value });
      glyph.shape();
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  resizeObserver.disconnect();
  title.dispose();
  subtitle.dispose();
  handle.dispose();
  inter.dispose();
  root.destroy();
}

// #endregion
