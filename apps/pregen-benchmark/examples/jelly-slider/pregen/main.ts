/**
 * Jelly slider, with shaders pregenerated at build time (see ./shaders.ts and scripts/pregen.ts).
 * Host code uses the raw WebGPU API, so TypeGPU is not shipped to the browser.
 */
import { markAppStart, markInteractive } from '../../../shared/bench.ts';
import { defineControls, mountControls } from '../../../shared/controls.ts';

import { normalize, setupScene, type Vec3 } from './scene.ts';

markAppStart();

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error('WebGPU is not supported');
}
const device = await adapter.requestDevice({
  // optionalFeatures: ['timestamp-query']
  requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [],
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format: presentationFormat, alphaMode: 'premultiplied' });
const scene = await setupScene(device, context, presentationFormat);

// #region Example controls

let attributionDismissed = false;
const attributionElement = document.getElementById('attribution') as HTMLDivElement;

function dismissAttribution() {
  if (!attributionDismissed && attributionElement) {
    attributionElement.style.opacity = '0';
    attributionElement.style.pointerEvents = 'none';
    attributionDismissed = true;
  }
}

canvas.addEventListener('mousedown', dismissAttribution, { once: true });
canvas.addEventListener('touchstart', dismissAttribution, { once: true });
canvas.addEventListener('wheel', dismissAttribution, { once: true });

const controls = defineControls({
  Quality: {
    initial: 'Auto',
    options: ['Auto', 'Very Low', 'Low', 'Medium', 'High', 'Ultra'],
    onSelectChange: (value: string) => {
      if (value === 'Auto') {
        void scene.computeOptimalQuality().then((scale) => {
          scene.qualityScale = scale;
          console.log(`Auto-selected quality scale: ${scale.toFixed(2)}`);
        });
        return;
      }

      const qualityMap: { [key: string]: number } = {
        'Very Low': 0.3,
        Low: 0.5,
        Medium: 0.7,
        High: 0.85,
        Ultra: 1.0,
      };

      scene.qualityScale = qualityMap[value] || 0.5;
    },
  },
  'Light dir': {
    initial: 0,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (v) => {
      const dir1 = normalize([0.18, -0.3, 0.64]);
      const dir2 = normalize([-0.5, -0.14, -0.8]);
      const mixed = dir1.map((a, i) => a * (1 - v) + dir2[i] * v);
      const finalDir = normalize(mixed);
      scene.lightDirection = finalDir;
    },
  },
  'Jelly Color': {
    initial: [1.0, 0.45, 0.075] as Vec3,
    onColorChange: (c: Vec3) => {
      scene.jellyColor = [c[0], c[1], c[2], 1.0];
    },
  },
  Blur: {
    initial: false,
    onToggleChange: (v) => {
      scene.blurEnabled = v;
    },
  },
});

mountControls(controls);
markInteractive();

// #endregion
