import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three/webgpu';

const fakeCanvas = {
  style: {},
  width: 1,
  height: 1,
  addEventListener() {},
  removeEventListener() {},
  getContext() {
    return null;
  },
};

/**
 * Builds the shaders of a mesh with the given material, the same way the renderer would,
 * without needing a GPU.
 */
export function buildMaterial(
  material: THREE.NodeMaterial,
  backend: 'webgpu' | 'webgl',
): { vertexShader: string; fragmentShader: string } {
  const renderer = new THREE.WebGPURenderer({
    canvas: fakeCanvas as unknown as HTMLCanvasElement,
    forceWebGL: backend === 'webgl',
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);

  const builder = (
    renderer.backend as unknown as {
      createNodeBuilder(
        object: THREE.Object3D,
        renderer: THREE.Renderer,
      ): THREE.NodeBuilder & { scene: THREE.Scene; camera: THREE.Camera };
    }
  ).createNodeBuilder(mesh, renderer);
  builder.scene = new THREE.Scene();
  builder.camera = new THREE.PerspectiveCamera();
  builder.build();

  return { vertexShader: builder.vertexShader, fragmentShader: builder.fragmentShader };
}

export const isNagaAvailable = spawnSync('naga', ['--version']).status === 0;

/**
 * Validates WGSL code with the `naga` CLI, returning the error output if the code is invalid.
 */
export function validateWgsl(code: string): string | undefined {
  const dir = mkdtempSync(join(tmpdir(), 'typegpu-three-'));
  try {
    const file = join(dir, 'shader.wgsl');
    writeFileSync(file, code);
    const result = spawnSync('naga', [file], { encoding: 'utf8' });
    return result.status === 0 ? undefined : `${result.stdout}${result.stderr}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
