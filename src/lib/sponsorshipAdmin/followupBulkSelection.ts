type PledgePage = { total: number; pledges: Array<{ id: string }> };

export async function collectMatchingPledgeIds(
  expectedTotal: number,
  fetchPage: (page: number, limit: number) => Promise<PledgePage>,
  limit = 50,
): Promise<string[]> {
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1 || expectedTotal > 1000) {
    throw new Error("助養批量選取須為 1 至 1000 筆");
  }
  const ids: string[] = [];
  for (let page = 1; ids.length < expectedTotal; page += 1) {
    const result = await fetchPage(page, limit);
    const remaining = expectedTotal - ids.length;
    if (
      result.total !== expectedTotal ||
      result.pledges.length === 0 ||
      result.pledges.length > Math.min(limit, remaining)
    ) {
      throw new Error("助養列表在選取期間變更");
    }
    ids.push(...result.pledges.map((item) => item.id));
  }
  if (new Set(ids).size !== expectedTotal) {
    throw new Error("助養列表在選取期間變更");
  }
  return ids;
}

export function addPledgeSelection(current: string[], additions: string[]): string[] {
  const next = [...new Set([...current, ...additions])];
  if (next.length > 1000) throw new Error("最多只能選取 1000 筆助養承諾");
  return next;
}
