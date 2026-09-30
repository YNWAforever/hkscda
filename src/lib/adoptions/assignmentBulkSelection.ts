type CasePage = { total: number; cases: Array<{ id: string }> };

export async function collectMatchingCaseIds(
  expectedTotal: number,
  fetchPage: (page: number, limit: number) => Promise<CasePage>,
  limit = 50,
): Promise<string[]> {
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1 || expectedTotal > 1000) {
    throw new Error("Adoption bulk selection must contain 1 to 1000 profiles");
  }
  const ids: string[] = [];
  for (let page = 1; ids.length < expectedTotal; page += 1) {
    const result = await fetchPage(page, limit);
    const remaining = expectedTotal - ids.length;
    if (
      result.total !== expectedTotal ||
      result.cases.length === 0 ||
      result.cases.length > Math.min(limit, remaining)
    ) {
      throw new Error("Adoption case list changed during bulk selection");
    }
    ids.push(...result.cases.map((item) => item.id));
  }
  if (new Set(ids).size !== expectedTotal) {
    throw new Error("Adoption case list changed during bulk selection");
  }
  return ids;
}

export function addCaseSelection(current: string[], additions: string[]): string[] {
  const next = [...new Set([...current, ...additions])];
  if (next.length > 1000) throw new Error("最多只能選取 1000 筆領養個案");
  return next;
}
