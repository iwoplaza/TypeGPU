const ids = new WeakMap<object, number>();
let nextId = 1;

/**
 * Returns a stable, unique numeric id for the given object.
 * The same object always maps to the same id.
 */
export function idOf(obj: object): number {
  let id = ids.get(obj);
  if (id === undefined) {
    id = nextId++;
    ids.set(obj, id);
  }
  return id;
}
