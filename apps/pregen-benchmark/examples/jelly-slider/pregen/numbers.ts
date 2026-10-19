const PERCENTAGE_WIDTH = 256 * 2;
const PERCENTAGE_HEIGHT = 128 * 2;
const PERCENTAGE_COUNT = 101; // 0% to 100%

export class NumberProvider {
  #device: GPUDevice;
  digitTextureAtlas: GPUTexture;

  constructor(device: GPUDevice) {
    this.#device = device;
    this.digitTextureAtlas = device.createTexture({
      size: [PERCENTAGE_WIDTH, PERCENTAGE_HEIGHT, PERCENTAGE_COUNT],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    });
  }

  async fillAtlas() {
    // Ensure the font is loaded before drawing
    await Promise.all([
      document.fonts.load('180px "Reddit Mono"'),
      document.fonts.load('140px "JetBrains Mono"'),
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = PERCENTAGE_WIDTH;
    canvas.height = PERCENTAGE_HEIGHT;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }

    const regularFont = '180px "Reddit Mono", monospace';
    const percentageFont = '140px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'white';

    const percentageImages: ImageBitmap[] = [];

    for (let i = 0; i <= 100; i++) {
      ctx.clearRect(0, 0, PERCENTAGE_WIDTH, PERCENTAGE_HEIGHT);

      const x = PERCENTAGE_WIDTH - 20;
      const y = PERCENTAGE_HEIGHT / 2;

      ctx.font = regularFont;
      ctx.fillText(`${i} `, x, y);

      ctx.font = percentageFont;
      ctx.fillText(`%`, x, y + 10);

      const bitmap = await createImageBitmap(canvas);
      percentageImages.push(bitmap);
    }

    // One layer per image, like `texture.write(images)` in the runtime variant
    percentageImages.forEach((image, layer) => {
      this.#device.queue.copyExternalImageToTexture(
        { source: image, origin: { x: 0, y: 0 }, flipY: false },
        {
          texture: this.digitTextureAtlas,
          mipLevel: 0,
          origin: { x: 0, y: 0, z: layer },
          premultipliedAlpha: false,
          colorSpace: 'srgb',
        },
        [PERCENTAGE_WIDTH, PERCENTAGE_HEIGHT],
      );
    });
  }
}
