import type { ResourceSummary } from '../types.ts';

export function formatMs(ms: number | undefined): string {
  if (ms === undefined) {
    return '—';
  }
  if (ms < 0.01) {
    return `${(ms * 1000).toFixed(1)} µs`;
  }
  return `${ms.toFixed(ms < 1 ? 3 : 2)} ms`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 10_000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1 << 30) {
    return `${(bytes / (1 << 30)).toFixed(2)} GiB`;
  }
  if (bytes >= 1 << 20) {
    return `${(bytes / (1 << 20)).toFixed(2)} MiB`;
  }
  if (bytes >= 1 << 10) {
    return `${(bytes / (1 << 10)).toFixed(1)} KiB`;
  }
  return `${bytes} B`;
}

export function describeResource(resource: ResourceSummary): string {
  if (resource.kind === 'buffer') {
    return `buffer · ${formatBytes(resource.size)}`;
  }
  const size =
    resource.depthOrArrayLayers > 1
      ? `${resource.width}×${resource.height}×${resource.depthOrArrayLayers}`
      : `${resource.width}×${resource.height}`;
  const extras = [
    resource.sampleCount > 1 ? `${resource.sampleCount}× MSAA` : undefined,
    resource.mipLevelCount > 1 ? `${resource.mipLevelCount} mips` : undefined,
  ].filter(Boolean);
  return [resource.format, size, ...extras].join(' · ');
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(n)} ${n === 1 ? singular : plural}`;
}

export function average(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  return sum / values.length;
}
