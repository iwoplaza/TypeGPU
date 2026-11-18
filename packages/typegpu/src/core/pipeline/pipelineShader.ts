import { resolve } from '../../resolutionCtx.ts';
import { getName } from '../../shared/meta.ts';
import type { TgpuBindGroupLayout } from '../../tgpuBindGroupLayout.ts';
import type { SelfResolvable } from '../../types.ts';
import { wgslEnableExtensions, wgslEnableExtensionToFeatureName } from '../../wgslExtensions.ts';
import { validateImmediateUsage } from '../immediate/immediateVar.ts';
import { namespace } from '../resolve/namespace.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import type { PerformanceTracker } from './performanceTracker.ts';
import { warnIfOverflow } from './webgpuLimitations.ts';

/**
 * Resolves a pipeline core into WGSL and compiles it into a shader module.
 * Shared by compute and render pipelines.
 */
export function resolvePipelineShader(
  core: SelfResolvable,
  root: ExperimentalTgpuRoot,
  performanceTracker: PerformanceTracker,
) {
  const device = root.device;
  const enableExtensions = wgslEnableExtensions.filter((extension) =>
    root.enabledFeatures.has(wgslEnableExtensionToFeatureName[extension]),
  );

  // Resolving code
  const ns = namespace({ names: root.nameRegistrySetting });
  const resolutionResult = performanceTracker.measureResolve(() =>
    resolve(core, {
      namespace: ns,
      minify: root.minify,
      enableExtensions,
      shaderGenerator: root.shaderGeneratorClass ? new root.shaderGeneratorClass() : undefined,
      root,
    }),
  );
  const { code, usedBindGroupLayouts, catchall, usedImmediate } = resolutionResult;

  if (catchall !== undefined) {
    usedBindGroupLayouts[catchall[0]]?.$name(
      `${getName(core) ?? '<unnamed>'} - Automatic Bind Group & Layout`,
    );
  }

  warnIfOverflow(usedBindGroupLayouts, device.limits);

  const immediateSize = usedImmediate ? validateImmediateUsage(usedImmediate, root) : 0;

  const module = device.createShaderModule({
    label: `${getName(core) ?? '<unnamed>'} - Shader`,
    code,
  });

  return { resolutionResult, module, immediateSize };
}

export function createPipelineLayout(
  core: object,
  root: ExperimentalTgpuRoot,
  usedBindGroupLayouts: TgpuBindGroupLayout[],
  immediateSize: number,
): GPUPipelineLayout {
  return root.device.createPipelineLayout({
    label: `${getName(core) ?? '<unnamed>'} - Pipeline Layout`,
    bindGroupLayouts: usedBindGroupLayouts.map((l) => root.unwrap(l)),
    immediateSize,
  });
}
