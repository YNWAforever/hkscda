type VolunteerPage = { total: number; profiles: Array<{ id: string }> };

export async function collectMatchingVolunteerIds(
  expectedTotal: number,
  fetchPage: (page: number, limit: number) => Promise<VolunteerPage>,
  limit = 50,
): Promise<string[]> {
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1 || expectedTotal > 1000) {
    throw new Error("Volunteer bulk selection must contain 1 to 1000 profiles");
  }
  const ids: string[] = [];
  for (let page = 1; ids.length < expectedTotal; page += 1) {
    const result = await fetchPage(page, limit);
    const remaining = expectedTotal - ids.length;
    if (
      result.total !== expectedTotal ||
      result.profiles.length === 0 ||
      result.profiles.length > Math.min(limit, remaining)
    ) {
      throw new Error("Volunteer directory changed during bulk selection");
    }
    ids.push(...result.profiles.map((profile) => profile.id));
  }
  if (new Set(ids).size !== expectedTotal) {
    throw new Error("Volunteer directory changed during bulk selection");
  }
  return ids;
}

export function addVolunteerSelection(current: string[], additions: string[]): string[] {
  const next = [...new Set([...current, ...additions])];
  if (next.length > 1000) throw new Error("最多只能選取 1000 筆義工身份");
  return next;
}
