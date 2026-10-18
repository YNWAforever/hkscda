/** Grow the visible ID until every option in this list is unambiguous. */
export function distinguishProfileId(id: string, candidateIds: readonly string[]): string {
  let length = Math.min(8, id.length);
  while (
    length < id.length &&
    candidateIds.some(
      (candidate) => candidate !== id && candidate.slice(0, length) === id.slice(0, length),
    )
  )
    length++;
  return id.slice(0, length);
}
