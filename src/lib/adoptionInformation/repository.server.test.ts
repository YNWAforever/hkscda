import { describe, expect, test } from "bun:test";

import { createSupabaseAdoptionInformationRepository } from "./repository.server";

class FakeQuery {
  calls: Array<{ table: string; method: string; payload?: unknown }>;
  table: string;
  count = 2;
  constructor(calls: Array<{ table: string; method: string; payload?: unknown }>, table: string) {
    this.calls = calls;
    this.table = table;
  }
  record(method: string, payload?: unknown) {
    this.calls.push({ table: this.table, method, payload });
    return this;
  }
  select(columns: string, options?: unknown) {
    return this.record("select", { columns, options });
  }
  eq(column: string, value: unknown) {
    return this.record("eq", { column, value });
  }
  order(column: string, options?: unknown) {
    return this.record("order", { column, options });
  }
  range(from: number, to: number) {
    return this.record("range", { from, to });
  }
  or(value: string) {
    return this.record("or", value);
  }
  then(resolve: (value: unknown) => unknown) {
    const data =
      this.table === "adoption_fees"
        ? [
            {
              id: "11111111-1111-4111-8111-111111111111",
              animal_type: "dog",
              item_name: "Mongrel 唐狗",
              price_hkd: "0",
              sort_order: 1,
              is_published: true,
            },
            {
              id: "33333333-3333-4333-8333-333333333333",
              animal_type: "cat",
              item_name: "Hidden",
              price_hkd: "1",
              sort_order: 9,
              is_published: false,
            },
          ]
        : [];
    return Promise.resolve({ data, error: null, count: this.count }).then(resolve);
  }
}

function setup() {
  const calls: Array<{ table: string; method: string; payload?: unknown }> = [];
  const client = {
    from(table: string) {
      return new FakeQuery(calls, table);
    },
  };
  return { calls, repo: createSupabaseAdoptionInformationRepository(client as never) };
}

describe("Supabase adoption information repository", () => {
  test("uses exact public columns, database publication filters, stable order, and defensive mapping", async () => {
    const { calls, repo } = setup();
    await expect(repo.listPublic()).resolves.toEqual({
      fees: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          animalType: "dog",
          itemName: "Mongrel 唐狗",
          priceHkd: "0",
          sortOrder: 1,
          isPublished: true,
        },
      ],
      estates: [],
    });
    expect(calls).toContainEqual({
      table: "adoption_fees",
      method: "select",
      payload: {
        columns: "id,animal_type,item_name,price_hkd,sort_order,is_published",
        options: undefined,
      },
    });
    expect(calls).toContainEqual({
      table: "adoption_fees",
      method: "eq",
      payload: { column: "is_published", value: true },
    });
    expect(calls).toContainEqual({
      table: "dog_friendly_estates",
      method: "order",
      payload: { column: "estate_name", options: { ascending: true } },
    });
  });

  test("caps range and escapes PostgREST search wildcards", async () => {
    const { calls, repo } = setup();
    await repo.listAdmin({
      resource: "estates",
      q: "50%_\\",
      animalType: undefined,
      page: 2,
      pageSize: 50,
    });
    expect(calls).toContainEqual({
      table: "dog_friendly_estates",
      method: "range",
      payload: { from: 50, to: 99 },
    });
    expect(calls.find((call) => call.method === "or")?.payload as string).toContain("\\%");
    expect(calls.find((call) => call.method === "or")?.payload as string).toContain("\\_");
    expect(calls.find((call) => call.method === "or")?.payload as string).toContain("\\\\");
  });
});
