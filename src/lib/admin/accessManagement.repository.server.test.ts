import { expect, test } from "bun:test";

import { createSupabaseAdminAccessRepository } from "./accessManagement.repository.server";

test("access audit pages contain exactly 50 non-overlapping rows", async () => {
  const ranges: Array<[number, number]> = [];
  const query = {
    select: () => query,
    in: () => query,
    order: () => query,
    range: async (from: number, to: number) => {
      ranges.push([from, to]);
      return { data: [], error: null };
    },
  };
  const repo = createSupabaseAdminAccessRepository({
    from: () => query,
  } as never);

  await repo.listAudit(1);
  await repo.listAudit(2);

  expect(ranges).toEqual([
    [0, 49],
    [50, 99],
  ]);
});
