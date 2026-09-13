/** Interval colouring keeps transitively overlapping duties in stable columns. */
export function layoutCalendarEvents<
  T extends { id: string; starts_at: string; ends_at: string | null },
>(events: T[]) {
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id),
  );
  const result = new Map<string, { column: number; columns: number }>();
  let group: { id: string; column: number }[] = [],
    ends: number[] = [],
    groupEnd = -Infinity;
  const flush = () => {
    for (const item of group) result.set(item.id, { column: item.column, columns: ends.length });
    group = [];
    ends = [];
  };
  for (const event of sorted) {
    const start = Date.parse(event.starts_at),
      end = Math.max(start + 60000, Date.parse(event.ends_at ?? event.starts_at));
    if (start >= groupEnd) flush();
    let column = ends.findIndex((value) => value <= start);
    if (column < 0) column = ends.length;
    ends[column] = end;
    group.push({ id: event.id, column });
    groupEnd = Math.max(groupEnd, end);
  }
  flush();
  return result;
}
