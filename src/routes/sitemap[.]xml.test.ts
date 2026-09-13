import { afterAll, describe, expect, mock, test } from "bun:test";

// Spread into new objects, not bare references -- bun's mock.module mutates
// the shared module namespace in place, so a bare reference would be mutated
// out from under us the moment the mock below is installed, and afterAll's
// "restore" would silently restore the already-mocked object.
const realSupabaseModule = { ...(await import("../lib/supabase")) };
const realStoriesModule = { ...(await import("../lib/content/publicStoriesPage.server")) };

function createSitemapFakeClient(data: Record<string, unknown>[]) {
  const eqFilters: Array<[string, unknown]> = [];
  let inFilter: { column: string; values: readonly string[] } | undefined;
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      eqFilters.push([column, value]);
      return query;
    },
    in: (column: string, values: readonly string[]) => {
      inFilter = { column, values };
      return query;
    },
    is: async () => {
      const matched = data.filter((row) => {
        const passesEq = eqFilters.every(([column, value]) => row[column] === value);
        const passesIn = !inFilter || inFilter.values.includes(row[inFilter.column] as string);
        return passesEq && passesIn;
      });
      return { data: matched, error: null };
    },
  };
  return { from: () => query };
}

afterAll(() => {
  mock.module("../lib/supabase", () => realSupabaseModule);
  mock.module("../lib/content/publicStoriesPage.server", () => realStoriesModule);
});

describe("publicDetailPaths", () => {
  test("includes a fostered animal's adoption and sponsor paths, excludes an adopted one", async () => {
    const data = [
      {
        id: "shelter-1",
        type: "cat",
        status: "available",
        adoption_eligible: true,
        sponsorship_eligible: false,
      },
      {
        id: "foster-1",
        type: "cat",
        status: "fostered",
        adoption_eligible: true,
        sponsorship_eligible: true,
      },
      {
        id: "gone-1",
        type: "cat",
        status: "adopted",
        adoption_eligible: true,
        sponsorship_eligible: true,
      },
    ];
    mock.module("../lib/supabase", () => ({ supabase: createSitemapFakeClient(data) }));
    mock.module("../lib/content/publicStoriesPage.server", () => ({
      loadPublicStoriesPage: async () => ({ items: [] }),
    }));
    const { publicDetailPaths } = await import("./sitemap[.]xml");

    const paths = await publicDetailPaths();

    expect(paths).toContain("/animals/cat/foster-1");
    expect(paths).toContain("/sponsors/foster-1");
    expect(paths).not.toContain("/animals/cat/gone-1");
  });
});
