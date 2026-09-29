import { afterAll, expect, mock, test } from "bun:test";

const realSupabaseModule = { ...(await import("../supabase")) };

afterAll(() => {
  mock.module("../supabase", () => realSupabaseModule);
});

const baseAnimal = {
  name: "T21",
  name_en: null,
  gender: "female" as const,
  age: "約 2 歲",
  age_en: null,
  description: null,
  description_en: null,
  image_url: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  adoption_eligible: true,
  sponsorship_eligible: false,
  retired_at: null,
  publication_state: "published" as const,
};

test("listPublicAnimals delegates all filters and page to the SQL reader", async () => {
  const calls: Array<{ name: string; filters: Record<string, unknown> }> = [];
  const row = {
    ...baseAnimal,
    id: "00000000-0000-4000-8000-000000000021",
    type: "cat",
    status: "available",
    name: "T21",
    public_profile: { code: "T21", birthday: null, neutered: null, suitability: null },
  };
  const client = {
    rpc: async (name: string, args: { p_filters: Record<string, unknown> }) => {
      calls.push({ name, filters: args.p_filters });
      return { data: { items: [row], total: 31, page: 2 }, error: null };
    },
  };
  mock.module("../supabase", () => ({ supabase: client }));
  const { listPublicAnimals } = await import("./publicListing.server");
  const result = await listPublicAnimals({
    purpose: "adoption",
    species: "cat",
    query: "T21",
    hasPhoto: true,
    ageBand: "adult",
    gender: "female",
    page: 2,
    pageSize: 15,
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].name).toBe("public_animal_listing_page");
  expect(calls[0].filters).toMatchObject({
    purpose: "adoption",
    species: "cat",
    query: "T21",
    hasPhoto: true,
    ageBand: "adult",
    page: 2,
    pageSize: 15,
  });
  expect(result.total).toBe(31);
  expect(result.items.map((item) => item.id)).toEqual([row.id]);
  expect(result.items[0].notes).toBeNull();
});
