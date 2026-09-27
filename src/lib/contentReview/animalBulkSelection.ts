type AnimalReviewPage = { total: number; items: Array<{ entity_id: string }> };

export async function collectAnimalReviewIds(
  expectedTotal: number,
  fetchPage: (page: number, limit: number) => Promise<AnimalReviewPage>,
  limit = 25,
): Promise<string[]> {
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1 || expectedTotal > 1000) {
    throw new Error("Animal review bulk selection must contain 1 to 1000 profiles");
  }
  const ids: string[] = [];
  for (let page = 1; ids.length < expectedTotal; page += 1) {
    const result = await fetchPage(page, limit);
    const remaining = expectedTotal - ids.length;
    if (
      result.total !== expectedTotal ||
      result.items.length === 0 ||
      result.items.length > Math.min(limit, remaining)
    ) {
      throw new Error("Animal review queue changed during bulk selection");
    }
    ids.push(...result.items.map((item) => item.entity_id));
  }
  if (new Set(ids).size !== expectedTotal) {
    throw new Error("Animal review queue changed during bulk selection");
  }
  return ids;
}

export function addAnimalReviewSelection(current: string[], additions: string[]): string[] {
  const next = [...new Set([...current, ...additions])];
  if (next.length > 1000) throw new Error("最多只能選取 1000 筆動物草稿");
  return next;
}
