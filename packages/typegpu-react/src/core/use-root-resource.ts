import { useEffect, useInsertionEffect, useReducer, useState } from 'react';
import { d, type TgpuRoot } from 'typegpu';

import { useRoot } from './root-context.tsx';

/**
 * How long resources are kept around after their component unmounts, so that work scheduled
 * before the unmount (e.g. a frame that runs before passive effects are cleaned up) can finish.
 */
const RELEASE_DELAY_MS = 200;

interface ResourceEntry<TSchema, TResource> {
  readonly root: TgpuRoot;
  readonly schema: TSchema;
  readonly resource: TResource;
  readonly destroy: (resource: TResource) => void;
  destroyed: boolean;
}

interface ResourceCache<TSchema, TResource> {
  /** The entry claimed by the last effect that ran */
  committed: ResourceEntry<TSchema, TResource> | undefined;
  /** Every entry that hasn't been destroyed yet, including ones from renders that never committed */
  live: Set<ResourceEntry<TSchema, TResource>>;
}

function destroyEntry<TResource>(
  cache: ResourceCache<unknown, TResource>,
  entry: ResourceEntry<unknown, TResource>,
) {
  cache.live.delete(entry);
  entry.destroyed = true;
  entry.destroy(entry.resource);
}

/**
 * Creates a resource tied to the current root and a schema, recreating it when either
 * changes (schemas are compared structurally).
 *
 * Resources are only destroyed once React is done with them: when an effect claims a newer one,
 * or when the component unmounts. Being hidden by `<Activity>` (or StrictMode's simulated
 * unmount) runs effect cleanups too, but keeps the component around, so it doesn't count.
 * Resources created by renders that never commit are destroyed along with the others, unless the
 * component never mounted at all, then they're left to the garbage collector. A timer can't tell
 * a discarded render apart from one that's just slow to commit.
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
    live: new Set(),
  }));
  const [, rerender] = useReducer((epoch: number) => epoch + 1, 0);

  const matches = (entry: ResourceEntry<TSchema, TResource> | undefined) =>
    !!entry &&
    !entry.destroyed &&
    entry.root === root &&
    d.schemasEqualStructurally(entry.schema as d.AnyData, schema as d.AnyData);

  let entry = matches(cache.committed) ? cache.committed : [...cache.live].find(matches);

  if (!entry) {
    entry = {
      root,
      schema,
      resource: create(root, schema),
      destroy,
      destroyed: false,
    };
    cache.live.add(entry);
  }

  // Insertion effects are the only ones React doesn't clean up when hiding a subtree with
  // <Activity> or when simulating an unmount in StrictMode, so this only runs on a real unmount.
  useInsertionEffect(
    () => () => {
      setTimeout(() => {
        for (const live of cache.live) {
          destroyEntry(cache, live);
        }
      }, RELEASE_DELAY_MS);
    },
    [cache],
  );

  const current = entry;
  useEffect(() => {
    if (current.destroyed) {
      // Should not happen, but if it does, rendering again with a fresh one
      rerender();
      return;
    }

    cache.committed = current;
    for (const other of cache.live) {
      if (other !== current) {
        // Superseded by `current`, or created by a render that never committed
        destroyEntry(cache, other);
      }
    }
  }, [cache, current]);

  return [current.resource, current.schema];
}
