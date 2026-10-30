import { expect, test } from "bun:test";

import { createInternshipRepository } from "./repository.server";

const ACTOR = "00000000-0000-4000-8000-000000000001";

/** A fake client whose application list holds `total` rows and refuses ranges past them. */
function pastLastPageClient(total: number) {
  const ranges: Array<[number, number]> = [];
  const applications = () => {
    const query = {
      select: () => query,
      order: () => query,
      ilike: () => query,
      eq: () => query,
      range: async (from: number, to: number) => {
        ranges.push([from, to]);
        return from >= total
          ? {
              data: null,
              count: null,
              error: { code: "PGRST103", message: "Requested range not satisfiable" },
            }
          : { data: [{ id: "a" }], count: total, error: null };
      },
    };
    return query;
  };
  const client = {
    from: (table: string) =>
      table === "admin_user"
        ? {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { role: "staff", status: "active" },
                  error: null,
                }),
              }),
            }),
          }
        : applications(),
  };
  return { client, ranges };
}

test("BUG-60: an internship page past the last row (PGRST103) is an empty page with the real total", async () => {
  const { client, ranges } = pastLastPageClient(1);
  const repo = createInternshipRepository(client as never);

  await expect(
    repo.command(ACTOR, { action: "list", page: 2, pageSize: 25, status: "submitted" } as never),
  ).resolves.toEqual({ kind: "applications", applications: [], total: 1, page: 2, pageSize: 25 });
  expect(ranges).toEqual([
    [25, 49],
    [0, 0],
  ]);
});
