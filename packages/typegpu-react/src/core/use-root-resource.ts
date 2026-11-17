import { useEffect, useReducer, useState } from 'react';
import { d, type TgpuRoot } from 'typegpu';

import { useRoot } from './root-context.tsx';

/**
 * How long a released resource is kept around, so that React's StrictMode can
 * unmount and remount effects without recreating it.
 */
const RELEASE_DELAY_MS = 200;

/**
 * How long a resource created during render waits for an effect to claim it. If the render
 * that created it never commits (it was discarded, or is suspended), it gets destroyed.
 */
const UNCLAIMED_DELAY_MS = 1000;

interface ResourceEntry<TSchema, TResource> {
  readonly root: TgpuRoot;
  readonly schema: TSchema;
  readonly resource: TResource;
  readonly destroy: (resource: TResource) => void;
  destroyed: boolean;
  timeout: ReturnType<typeof setTimeout> | undefined;
}

interface ResourceCache<TSchema, TResource> {
  /** The entry claimed by the last effect that ran */
  committed: ResourceEntry<TSchema, TResource> | undefined;
  /** The entry created by the latest render, not yet claimed by an effect */
  pending: ResourceEntry<TSchema, TResource> | undefined;
}

function scheduleDestroy<TResource>(entry: ResourceEntry<unknown, TResource>, delay: number) {
  clearTimeout(entry.timeout);
  entry.timeout = setTimeout(() => {
    entry.destroyed = true;
    entry.destroy(entry.resource);
  }, delay);
}

/**
 * Creates a resource tied to the current root and a schema, recreating it when either
 * changes (schemas are compared structurally).
 *
 * Resources are only destroyed once React is done with them: after the effect that
 * claimed them is cleaned up, or when the render that created them never commits.
 *
 * @returns The resource, and the schema it was created with.
 */
export function useRootResource<TSchema, TResource>(
  schema: TSchema,
  create: (root: TgpuRoot, schema: TSchema) => TResource,
  destroy: (resource: TResource) => void,
): [TResource, TSchema] {
  const root = useRoot();
  const [cache] = useState<ResourceCache<TSchema, TResource>>(() => ({
    committed: undefined,
    pending: undefined,
  }));
  const [, rerender] = useReducer((epoch: number) => epoch + 1, 0);

  const matches = (entry: ResourceEntry<TSchema, TResource> | undefined) =>
    !!entry &&
    !entry.destroyed &&
    entry.root === root &&
    d.schemasEqualStructurally(entry.schema as d.AnyData, schema as d.AnyData);

  let entry = matches(cache.committed)
    ? cache.committed
    : matches(cache.pending)
      ? cache.pending
      : undefined;

  if (!entry) {
    entry = {
      root,
      schema,
      resource: create(root, schema),
      destroy,
      destroyed: false,
      timeout: undefined,
    };
    cache.pending = entry;
  }

  if (entry === cache.pending) {
    // Rescheduled on every render that uses it, the effect cancels it once it commits
    scheduleDestroy(entry, UNCLAIMED_DELAY_MS);
  }

  const current = entry;
  useEffect(() => {
    if (current.destroyed) {
      // It took longer to commit than we were willing to wait, rendering again with a fresh one
      rerender();
      return;
    }

    clearTimeout(current.timeout);
    cache.committed = current;
    if (cache.pending === current) {
      cache.pending = undefined;
    }

    return () => {
      scheduleDestroy(current, RELEASE_DELAY_MS);
    };
  }, [cache, current]);

  return [current.resource, current.schema];
}
