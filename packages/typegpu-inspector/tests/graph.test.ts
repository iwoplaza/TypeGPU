import { describe, expect, it } from 'vitest';
import { buildPassGraph } from '../src/graph.ts';
import type { BufferSummary, PassRecord, ResourceUse, TextureSummary } from '../src/types.ts';

let nextId = 1;

function texture(label: string): TextureSummary {
  return {
    kind: 'texture',
    id: nextId++,
    label,
    format: 'rgba8unorm',
    width: 4,
    height: 4,
    depthOrArrayLayers: 1,
    mipLevelCount: 1,
    sampleCount: 1,
    dimension: '2d',
    usage: 0,
    isCanvas: false,
  };
}

function buffer(label: string): BufferSummary {
  return { kind: 'buffer', id: nextId++, label, size: 16, usage: 0 };
}

function pass(
  kind: PassRecord['kind'],
  label: string,
  reads: ResourceUse[],
  writes: ResourceUse[],
): PassRecord {
  return {
    id: nextId++,
    kind,
    label,
    reads,
    writes,
    pipelines: [],
    bindGroups: [],
    calls: [],
    draws: 0,
    vertices: 0,
    instances: 0,
    dispatches: 0,
    workgroups: 0,
    bundles: 0,
    snapshots: [],
    attachments: [],
    timing: 'unavailable',
    gpuTime: undefined,
    ownTimestamps: false,
  };
}

const read = (resource: TextureSummary | BufferSummary): ResourceUse => ({
  resource,
  role: 'binding',
  access: 'read',
});
const write = (resource: TextureSummary | BufferSummary): ResourceUse => ({
  resource,
  role: 'color',
  access: 'write',
});

describe('buildPassGraph', () => {
  it('connects a writer to later readers of the same resource', () => {
    const particles = buffer('particles');
    const screen = texture('canvas');

    const graph = buildPassGraph([
      pass('compute', 'simulate', [], [write(particles)]),
      pass('render', 'draw particles', [read(particles)], [write(screen)]),
    ]);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ from: 0, to: 1 });
    expect(graph.edges[0]?.resources.map((r) => r.label)).toEqual(['particles']);
    expect(graph.nodes.map((n) => n.layer)).toEqual([0, 1]);
    expect(graph.layerCount).toBe(2);
  });

  it('chains passes that keep drawing into the same attachment', () => {
    const screen = texture('canvas');
    const depth = texture('depth');

    const loadWrite = (resource: TextureSummary): ResourceUse => ({
      resource,
      role: 'color',
      access: 'read-write',
    });

    const graph = buildPassGraph([
      pass('render', 'cube A', [], [write(screen), write(depth)]),
      pass('render', 'cube B', [read(screen), read(depth)], [loadWrite(screen), loadWrite(depth)]),
      pass('render', 'plane', [read(screen)], [loadWrite(screen)]),
    ]);

    expect(graph.edges.map((e) => `${e.from}->${e.to}`)).toEqual(['0->1', '1->2']);
    expect(graph.edges[0]?.resources.map((r) => r.label).toSorted()).toEqual(['canvas', 'depth']);
    expect(graph.nodes.map((n) => n.layer)).toEqual([0, 1, 2]);
  });

  it('places independent passes in the same layer on separate rows', () => {
    const graph = buildPassGraph([
      pass('compute', 'a', [], [write(buffer('x'))]),
      pass('compute', 'b', [], [write(buffer('y'))]),
      pass('copy', 'c', [], []),
    ]);

    expect(graph.edges).toHaveLength(0);
    expect(graph.nodes.map((n) => [n.layer, n.row])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(graph.layerCount).toBe(1);
  });

  it('merges multiple resources flowing between the same two passes', () => {
    const a = buffer('a');
    const b = buffer('b');
    const graph = buildPassGraph([
      pass('compute', 'producer', [], [write(a), write(b)]),
      pass('compute', 'consumer', [read(a), read(b)], []),
    ]);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.resources).toHaveLength(2);
  });

  it('does not create self edges for read-write resources', () => {
    const t = texture('t');
    const graph = buildPassGraph([
      pass('render', 'only', [read(t)], [{ resource: t, role: 'color', access: 'read-write' }]),
    ]);
    expect(graph.edges).toHaveLength(0);
  });

  it('produces a structure key that only changes with the graph shape', () => {
    const t = texture('t');
    const build = () =>
      buildPassGraph([
        pass('compute', 'gen', [], [write(t)]),
        pass('render', 'show', [read(t)], []),
      ]);

    expect(build().structureKey).toBe(build().structureKey);

    const different = buildPassGraph([
      pass('compute', 'gen', [], [write(t)]),
      pass('render', 'show', [], []),
    ]);
    expect(different.structureKey).not.toBe(build().structureKey);
  });
});
