/**
 * `/animals/{cat,dog}/$id` and `/sponsors/$id` read the id straight out of the
 * URL, so it is arbitrary user input: typos, stale links and crawlers all reach
 * the loader. `animals.id` is a uuid column and Postgres rejects non-uuid text
 * with 22P02, so handing the raw param to the query turns a missing page into a
 * 500. Callers screen the id first and fall through to the same "not in the
 * public listing" state that a well-formed but unavailable id produces.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPublicAnimalId(id: string): boolean {
  return UUID_PATTERN.test(id);
}
