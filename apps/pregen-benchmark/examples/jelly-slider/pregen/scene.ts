import { markFirstSubmit, measureFrame } from '../../../shared/bench.ts';
import { CameraController } from './camera.ts';
import { NUM_POINTS, SLIDER_END, SLIDER_START, SLIDER_Y_OFFSET } from './constants.ts';
import { EventHandler } from './events.ts';
import { bezierWgsl, blitWgsl, rayMarchWgsl, taaResolveWgsl } from './generated.ts';
import { NumberProvider } from './numbers.ts';
import { Slider } from './slider.ts';
import { TAAResolver } from './taa.ts';

export type Vec3 = [number, number, number];

const f32 = Math.fround;

export function normalize(v: readonly number[]): Vec3 {
  const [x, y, z] = [f32(v[0]), f32(v[1]), f32(v[2])];
  const len = Math.sqrt(x * x + y * y + z * z);
  return [f32(x / len), f32(y / len), f32(z / len)];
}

// SceneParams: {
//   seed: vec2f            @ 0
//   jellyColor: vec4f      @ 16
//   light: DirectionalLight @ 32 { direction: vec3f @ 0, color: vec3f @ 16 } (32 bytes)
//   blurEnabled: u32       @ 64
// } = 80 bytes
const SEED_OFFSET = 0;
const JELLY_COLOR_OFFSET = 16;
const LIGHT_DIRECTION_OFFSET = 32;
const LIGHT_COLOR_OFFSET = 48;
const BLUR_ENABLED_OFFSET = 64;
const SCENE_PARAMS_SIZE = 80;

function createTextures(device: GPUDevice, width: number, height: number) {
  return [0, 1].map(() => {
    const texture = device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    });

    return {
      write: texture.createView(),
      sampled: texture.createView(),
    };
  });
}

export async function setupScene(
  device: GPUDevice,
  context: GPUCanvasContext,
  presentationFormat: GPUTextureFormat,
) {
  const hasTimestampQuery = device.features.has('timestamp-query');
  const canvas = context.canvas as HTMLCanvasElement;

  const slider = new Slider(
    device,
    device.createShaderModule({ code: bezierWgsl }),
    SLIDER_START,
    SLIDER_END,
    NUM_POINTS,
    SLIDER_Y_OFFSET,
  );
  const bezierTexture = slider.bezierTexture.createView({ format: 'rgba16float', dimension: '2d' });

  const digitsProvider = new NumberProvider(device);
  await digitsProvider.fillAtlas();
  const digitsTexture = digitsProvider.digitTextureAtlas.createView({
    format: 'rgba8unorm',
    dimension: '2d-array',
  });

  let qualityScale = 0.5;
  let [prevCanvasWidth, prevCanvasHeight] = [canvas.width, canvas.height];
  let [width, height] = [canvas.width * qualityScale, canvas.height * qualityScale];

  let textures = createTextures(device, width, height);

  const filteringSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const camera = new CameraController(
    device,
    [f32(0.024), f32(2.7), f32(1.9)],
    [0, 0, 0],
    [0, 1, 0],
    Math.PI / 4,
    width,
    height,
  );

  const sceneParamsBuffer = device.createBuffer({
    size: SCENE_PARAMS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  });
  {
    const mapped = sceneParamsBuffer.getMappedRange();
    const floats = new Float32Array(mapped);
    floats.set([0, 0], SEED_OFFSET / 4);
    floats.set([1.0, 0.45, 0.075, 1.0], JELLY_COLOR_OFFSET / 4);
    floats.set(normalize([0.19, -0.24, 0.75]), LIGHT_DIRECTION_OFFSET / 4);
    floats.set([1, 1, 1], LIGHT_COLOR_OFFSET / 4);
    new Uint32Array(mapped)[BLUR_ENABLED_OFFSET / 4] = 0;
    sceneParamsBuffer.unmap();
  }
  const seedData = new Float32Array(2);

  const fullScreenModules = {
    rayMarch: device.createShaderModule({ code: rayMarchWgsl }),
    blit: device.createShaderModule({ code: blitWgsl }),
  };

  const rayMarchPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: fullScreenModules.rayMarch },
    fragment: { module: fullScreenModules.rayMarch, targets: [{ format: 'rgba8unorm' }] },
    primitive: { topology: 'triangle-list' },
  });

  const group = device.createBindGroup({
    layout: rayMarchPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: filteringSampler },
      { binding: 1, resource: bezierTexture },
      { binding: 2, resource: digitsTexture },
      { binding: 3, resource: { buffer: slider.endCapBuffer } },
      { binding: 4, resource: { buffer: sceneParamsBuffer } },
      { binding: 5, resource: { buffer: camera.cameraBuffer } },
    ],
  });

  function drawRayMarch(
    view: GPUTextureView,
    timestampWrites?: GPURenderPassTimestampWrites,
    beforeFinish?: (encoder: GPUCommandEncoder) => void,
  ) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store' }],
      ...(timestampWrites ? { timestampWrites } : {}),
    });
    pass.setPipeline(rayMarchPipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
    beforeFinish?.(encoder);
    device.queue.submit([encoder.finish()]);
  }

  /**
   * Responsible for rendering the bound texture to the screen as is
   */
  const blitPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: fullScreenModules.blit },
    fragment: { module: fullScreenModules.blit, targets: [{ format: presentationFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  const eventHandler = new EventHandler(canvas);
  let lastTimestamp: number | null = null;
  let frameCount = 0;
  const taaResolver = new TAAResolver(
    device,
    device.createShaderModule({ code: taaResolveWgsl }),
    width,
    height,
  );

  function createBindGroups() {
    return {
      render: [0, 1].map((frame) =>
        device.createBindGroup({
          layout: blitPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: taaResolver.getResolvedTexture(frame) },
            { binding: 1, resource: filteringSampler },
          ],
        }),
      ),
    };
  }
  let bindGroups = createBindGroups();

  function onResize() {
    [prevCanvasWidth, prevCanvasHeight] = [canvas.width, canvas.height];
    [width, height] = [canvas.width * qualityScale, canvas.height * qualityScale];
    camera.updateProjection(Math.PI / 4, width, height);
    textures = createTextures(device, width, height);
    taaResolver.resize(width, height);
    frameCount = 0;

    bindGroups = createBindGroups();
  }

  function render(timestamp: number) {
    measureFrame(() => renderBody(timestamp));
    markFirstSubmit(device);
    requestAnimationFrame(render);
  }

  function renderBody(timestamp: number) {
    if (canvas.width !== prevCanvasWidth || canvas.height !== prevCanvasHeight) {
      onResize();
    }

    frameCount++;
    camera.jitter();
    const deltaTime = Math.min(
      lastTimestamp !== null ? (timestamp - lastTimestamp) * 0.001 : 0,
      0.1,
    );
    lastTimestamp = timestamp;

    seedData[0] = (Math.random() - 0.5) * 2;
    seedData[1] = (Math.random() - 0.5) * 2;
    device.queue.writeBuffer(sceneParamsBuffer, SEED_OFFSET, seedData);

    eventHandler.update();
    slider.setDragX(eventHandler.currentMouseX);
    slider.update(deltaTime);

    const currentFrame = frameCount % 2;

    drawRayMarch(textures[currentFrame].sampled);

    taaResolver.resolve(textures[currentFrame].sampled, frameCount, currentFrame);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(blitPipeline);
    pass.setBindGroup(0, bindGroups.render[currentFrame]);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  requestAnimationFrame(render);

  // Timestamp queries for the performance measurement, created lazily like in the runtime variant
  let timestamps:
    | { querySet: GPUQuerySet; resolveBuffer: GPUBuffer; readBuffer: GPUBuffer; available: boolean }
    | undefined;

  async function readTimestamps(callback: (start: bigint, end: bigint) => void) {
    if (!timestamps?.available) {
      return;
    }
    timestamps.available = false;
    try {
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(timestamps.resolveBuffer, 0, timestamps.readBuffer, 0, 16);
      device.queue.submit([encoder.finish()]);
      await timestamps.readBuffer.mapAsync(GPUMapMode.READ);
      const data = new BigUint64Array(timestamps.readBuffer.getMappedRange().slice());
      timestamps.readBuffer.unmap();
      callback(data[0], data[1]);
    } finally {
      timestamps.available = true;
    }
  }

  return {
    rayMarchPipeline,
    get qualityScale() {
      return qualityScale;
    },
    set qualityScale(v: number) {
      qualityScale = v;
      onResize();
    },
    set lightDirection(v: Vec3) {
      device.queue.writeBuffer(sceneParamsBuffer, LIGHT_DIRECTION_OFFSET, new Float32Array(v));
    },
    set jellyColor(v: readonly number[]) {
      device.queue.writeBuffer(sceneParamsBuffer, JELLY_COLOR_OFFSET, new Float32Array(v));
    },
    set blurEnabled(v: boolean) {
      device.queue.writeBuffer(
        sceneParamsBuffer,
        BLUR_ENABLED_OFFSET,
        new Uint32Array([v ? 1 : 0]),
      );
    },
    async computeOptimalQuality() {
      if (!hasTimestampQuery) {
        return 0.5;
      }

      const targetFrameTime = 5;
      const tolerance = 2.0;
      let resolutionScale = 0.3;
      let lastTimeMs = 0;

      timestamps ??= {
        querySet: device.createQuerySet({ type: 'timestamp', count: 2 }),
        resolveBuffer: device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        }),
        readBuffer: device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        }),
        available: true,
      };
      const { querySet, resolveBuffer } = timestamps;

      for (let i = 0; i < 8; i++) {
        const testTexture = device.createTexture({
          size: [canvas.width * resolutionScale, canvas.height * resolutionScale],
          format: 'rgba8unorm',
          usage:
            GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
        });

        drawRayMarch(
          testTexture.createView(),
          { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 },
          (encoder) => encoder.resolveQuerySet(querySet, 0, 2, resolveBuffer, 0),
        );
        void readTimestamps((start, end) => {
          lastTimeMs = Number(end - start) / 1e6;
        });

        await device.queue.onSubmittedWorkDone();
        testTexture.destroy();

        if (Math.abs(lastTimeMs - targetFrameTime) < tolerance) {
          break;
        }

        const adjustment = lastTimeMs > targetFrameTime ? -0.1 : 0.1;
        resolutionScale = Math.max(0.3, Math.min(1.0, resolutionScale + adjustment));
      }

      return resolutionScale;
    },
  };
}
