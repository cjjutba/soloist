/** Canonical UUID test (any version). Shared by the route guards that compare a path
 * param against a `uuid` column — a non-uuid id would otherwise reach the DB and raise an
 * `invalid input syntax for type uuid` 500 instead of a clean `notFound()`. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
