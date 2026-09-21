export type PassKind = 'render' | 'compute' | 'copy';

export type ResourceRole =
  | 'color'
  | 'resolve'
  | 'depth-stencil'
  | 'binding'
  | 'storage'
  | 'vertex'
  | 'index'
  | 'indirect'
  | 'copy-src'
  | 'copy-dst';

export type ResourceAccess = 'read' | 'write' | 'read-write';

export interface TextureSummary {
  readonly kind: 'texture';
  readonly id: number;
  readonly label: string;
  readonly format: GPUTextureFormat;
  readonly width: number;
  readonly height: number;
  readonly depthOrArrayLayers: number;
  readonly mipLevelCount: number;
  readonly sampleCount: number;
  readonly dimension: GPUTextureDimension;
  readonly usage: number;
  readonly isCanvas: boolean;
}

export interface BufferSummary {
  readonly kind: 'buffer';
  readonly id: number;
  readonly label: string;
  readonly size: number;
  readonly usage: number;
}

export type ResourceSummary = TextureSummary | BufferSummary;

export interface ResourceUse {
  readonly resource: ResourceSummary;
  readonly role: ResourceRole;
  readonly access: ResourceAccess;
  /** Which bind group slot / binding this came from, if any */
  readonly slot?: string | undefined;
  /** Attachment-related details, in a human readable form */
  readonly details?: string | undefined;
}

/**
 * A copy of a texture subresource, taken right after a pass finished writing to it.
 */
export interface Snapshot {
  /** The inspector-owned texture holding the copied data */
  readonly texture: GPUTexture;
  readonly source: TextureSummary;
  readonly role: ResourceRole;
  readonly width: number;
  readonly height: number;
  readonly format: GPUTextureFormat;
  readonly sampleCount: number;
  readonly mipLevel: number;
  readonly arrayLayer: number;
}

export type TimingState =
  /** Timestamps are being resolved */
  | 'pending'
  /** Timing is available */
  | 'ready'
  /** The device has no `timestamp-query` feature or timing could not be measured */
  | 'unavailable';

export interface DrawCall {
  readonly kind:
    | 'draw'
    | 'drawIndexed'
    | 'drawIndirect'
    | 'drawIndexedIndirect'
    | 'executeBundles'
    | 'dispatchWorkgroups'
    | 'dispatchWorkgroupsIndirect';
  readonly pipeline: string | undefined;
  readonly args: readonly number[];
}

export interface PassRecord {
  readonly id: number;
  readonly kind: PassKind;
  label: string;
  readonly reads: ResourceUse[];
  readonly writes: ResourceUse[];
  readonly pipelines: string[];
  readonly bindGroups: string[];
  readonly calls: DrawCall[];
  draws: number;
  vertices: number;
  instances: number;
  dispatches: number;
  workgroups: number;
  bundles: number;
  readonly snapshots: Snapshot[];
  /** Attachment info for render passes, in the order of the descriptor */
  readonly attachments: string[];
  timing: TimingState;
  /** GPU time in milliseconds */
  gpuTime: number | undefined;
  /** Whether the pass came with its own timestamp writes, which the inspector then read */
  ownTimestamps: boolean;
}

export interface FrameRecord {
  readonly index: number;
  readonly passes: PassRecord[];
  /** Whether texture snapshots were taken for this frame */
  readonly hasSnapshots: boolean;
  /** `performance.now()` at the moment the frame was finalized */
  readonly finishedAt: number;
  /** The device that the last submitted passes were recorded on */
  device: GPUDevice | undefined;
}
