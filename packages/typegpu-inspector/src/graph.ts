import type { PassKind, PassRecord, ResourceSummary } from './types.ts';

export interface GraphNode {
  readonly index: number;
  readonly pass: PassRecord;
  /** Horizontal position: the longest dependency chain leading to this node */
  readonly layer: number;
  /** Vertical position within the layer */
  readonly row: number;
}

export interface GraphEdge {
  readonly from: number;
  readonly to: number;
  /** The resources flowing along this edge */
  readonly resources: readonly ResourceSummary[];
}

export interface PassGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly layerCount: number;
  /** A cheap fingerprint of the graph's shape, for detecting structural changes between frames */
  readonly structureKey: string;
}

/**
 * Builds a dependency graph out of passes recorded in submission order.
 * An edge A -> B means that B uses a resource that A was the last to write to.
 */
export function buildPassGraph(passes: readonly PassRecord[]): PassGraph {
  const lastWriter = new Map<number, number>();
  const edgeMap = new Map<string, { from: number; to: number; resources: ResourceSummary[] }>();
  const preds: number[][] = passes.map(() => []);

  passes.forEach((pass, index) => {
    const seenResources = new Set<number>();
    for (const use of [...pass.reads, ...pass.writes]) {
      const resId = use.resource.id;
      if (seenResources.has(resId)) {
        continue;
      }
      seenResources.add(resId);

      const writer = lastWriter.get(resId);
      if (writer !== undefined && writer !== index) {
        const key = `${writer}->${index}`;
        const existing = edgeMap.get(key);
        if (existing) {
          existing.resources.push(use.resource);
        } else {
          edgeMap.set(key, { from: writer, to: index, resources: [use.resource] });
          preds[index]?.push(writer);
        }
      }
    }
    for (const use of pass.writes) {
      lastWriter.set(use.resource.id, index);
    }
  });

  const layers: number[] = [];
  const rowsPerLayer: number[] = [];
  const nodes: GraphNode[] = passes.map((pass, index) => {
    let layer = 0;
    for (const pred of preds[index] ?? []) {
      layer = Math.max(layer, (layers[pred] ?? 0) + 1);
    }
    layers[index] = layer;
    const row = rowsPerLayer[layer] ?? 0;
    rowsPerLayer[layer] = row + 1;
    return { index, pass, layer, row };
  });

  const edges = [...edgeMap.values()];
  const structureKey = [
    nodes.map((n) => `${shortKind(n.pass.kind)}:${n.pass.label}@${n.layer},${n.row}`).join('|'),
    edges.map((e) => `${e.from}>${e.to}`).join('|'),
  ].join('#');

  return {
    nodes,
    edges,
    layerCount: rowsPerLayer.length,
    structureKey,
  };
}

function shortKind(kind: PassKind): string {
  return kind[0] ?? '?';
}
