type SupporterPage = { total: number; supporters: Array<{ id: string }> };

export async function collectMatchingSupporterIds(
  expectedTotal: number,
  fetchPage: (page: number, pageSize: number) => Promise<SupporterPage>,
  pageSize = 100,
): Promise<string[]> {
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1 || expectedTotal > 1000) {
    throw new Error("Bulk selection must contain 1 to 1000 supporters");
  }
  const ids: string[] = [];
  for (let page = 1; ids.length < expectedTotal; page += 1) {
    const result = await fetchPage(page, pageSize);
    const remaining = expectedTotal - ids.length;
    if (
      result.total !== expectedTotal ||
      result.supporters.length === 0 ||
      result.supporters.length > Math.min(pageSize, remaining)
    ) {
      throw new Error("Supporter list changed during bulk selection");
    }
    ids.push(...result.supporters.map((supporter) => supporter.id));
  }
  if (new Set(ids).size !== expectedTotal) {
    throw new Error("Supporter list changed during bulk selection");
  }
  return ids;
}
