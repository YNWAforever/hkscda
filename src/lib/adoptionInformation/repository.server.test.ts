import { describe, expect, test } from "bun:test";

import { createSupabaseAdoptionInformationRepository } from "./repository.server";

class FakeQuery {
  calls: Array<{ table: string; method: string; payload?: unknown }>;
  table: string;
  count = 2;
  rows?: unknown[];
  constructor(
    calls: Array<{ table: string; method: string; payload?: unknown }>,
    table: string,
    rows?: unknown[],
  ) {
    this.calls = calls;
    this.table = table;
    this.rows = rows;
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
      this.rows ??
      (this.table === "adoption_fees"
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
        : []);
    return Promise.resolve({ data, error: null, count: this.count }).then(resolve);
  }
}

function setup(options?: {
  rowsByTable?: Record<string, unknown[]>;
  rpcResponses?: Record<string, { data: unknown; error: unknown }>;
}) {
  const calls: Array<{ table: string; method: string; payload?: unknown }> = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const client = {
    from(table: string) {
      return new FakeQuery(calls, table, options?.rowsByTable?.[table]);
    },
    rpc(fn: string, args: unknown) {
      rpcCalls.push({ fn, args });
      return Promise.resolve(options?.rpcResponses?.[fn] ?? { data: null, error: null });
    },
  };
  return {
    calls,
    rpcCalls,
    repo: createSupabaseAdoptionInformationRepository(client as never),
  };
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
      rules: [],
      careTopics: [],
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

  test("upsertRule calls the audited RPC with snake_case params and maps the returned row", async () => {
    const ruleRow = {
      id: "99999999-9999-4999-8999-999999999999",
      content_zh: "領養前須簽署協議",
      content_en: "Sign the agreement before adoption",
      sort_order: 2,
      is_published: true,
    };
    const { rpcCalls, repo } = setup({
      rpcResponses: {
        upsert_adoption_rule_with_audit: { data: ruleRow, error: null },
      },
    });
    const result = await repo.upsertRule(
      {
        id: undefined,
        content: { "zh-HK": "領養前須簽署協議", en: "Sign the agreement before adoption" },
        sortOrder: 2,
        isPublished: true,
      },
      "actor-1",
    );
    expect(rpcCalls).toEqual([
      {
        fn: "upsert_adoption_rule_with_audit",
        args: {
          p_actor_user_id: "actor-1",
          p_id: null,
          p_content_zh: "領養前須簽署協議",
          p_content_en: "Sign the agreement before adoption",
          p_sort_order: 2,
          p_is_published: true,
        },
      },
    ]);
    expect(result).toEqual({
      id: "99999999-9999-4999-8999-999999999999",
      content: { "zh-HK": "領養前須簽署協議", en: "Sign the agreement before adoption" },
      sortOrder: 2,
      isPublished: true,
    });
  });

  test("upsertCareTopic calls the audited RPC with snake_case params and maps the returned row", async () => {
    const careTopicRow = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      animal_type: "cat",
      label_zh: "美容",
      label_en: "Grooming",
      content_zh: "定期梳毛",
      content_en: "Brush regularly",
      sort_order: 3,
      is_published: false,
    };
    const { rpcCalls, repo } = setup({
      rpcResponses: {
        upsert_care_topic_with_audit: { data: careTopicRow, error: null },
      },
    });
    const result = await repo.upsertCareTopic(
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        animalType: "cat",
        label: { "zh-HK": "美容", en: "Grooming" },
        content: { "zh-HK": "定期梳毛", en: "Brush regularly" },
        sortOrder: 3,
        isPublished: false,
      },
      "actor-2",
    );
    expect(rpcCalls).toEqual([
      {
        fn: "upsert_care_topic_with_audit",
        args: {
          p_actor_user_id: "actor-2",
          p_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          p_animal_type: "cat",
          p_label_zh: "美容",
          p_label_en: "Grooming",
          p_content_zh: "定期梳毛",
          p_content_en: "Brush regularly",
          p_sort_order: 3,
          p_is_published: false,
        },
      },
    ]);
    expect(result).toEqual({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      animalType: "cat",
      label: { "zh-HK": "美容", en: "Grooming" },
      content: { "zh-HK": "定期梳毛", en: "Brush regularly" },
      sortOrder: 3,
      isPublished: false,
    });
  });

  test("listPublic() includes published rules and care topics, filtering out unpublished rows", async () => {
    const { repo } = setup({
      rowsByTable: {
        adoption_rules: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            content_zh: "必須簽署領養協議",
            content_en: "Must sign the adoption agreement",
            sort_order: 1,
            is_published: true,
          },
          {
            id: "66666666-6666-4666-8666-666666666666",
            content_zh: "Hidden rule",
            content_en: "Hidden rule",
            sort_order: 9,
            is_published: false,
          },
        ],
        care_topics: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            animal_type: "dog",
            label_zh: "餵食",
            label_en: "Feeding",
            content_zh: "每日餵食兩次",
            content_en: "Feed twice daily",
            sort_order: 1,
            is_published: true,
          },
          {
            id: "88888888-8888-4888-8888-888888888888",
            animal_type: "cat",
            label_zh: "Hidden",
            label_en: "Hidden",
            content_zh: "Hidden",
            content_en: "Hidden",
            sort_order: 9,
            is_published: false,
          },
        ],
      },
    });
    const result = await repo.listPublic();
    expect(result.rules).toEqual([
      {
        id: "55555555-5555-4555-8555-555555555555",
        content: { "zh-HK": "必須簽署領養協議", en: "Must sign the adoption agreement" },
        sortOrder: 1,
        isPublished: true,
      },
    ]);
    expect(result.careTopics).toEqual([
      {
        id: "77777777-7777-4777-8777-777777777777",
        animalType: "dog",
        label: { "zh-HK": "餵食", en: "Feeding" },
        content: { "zh-HK": "每日餵食兩次", en: "Feed twice daily" },
        sortOrder: 1,
        isPublished: true,
      },
    ]);
  });

  test("listPublic() silently drops a malformed adoption rule row instead of throwing", async () => {
    const { repo } = setup({
      rowsByTable: {
        adoption_rules: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            content_zh: "必須簽署領養協議",
            // content_en is missing, so the row fails schema validation.
            sort_order: 1,
            is_published: true,
          },
        ],
      },
    });
    const result = await repo.listPublic();
    expect(result.rules).toEqual([]);
  });

  test("listAdmin({resource: 'rules'}) queries adoption_rules with the correct columns", async () => {
    const { calls, repo } = setup({
      rowsByTable: {
        adoption_rules: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            content_zh: "必須簽署領養協議",
            content_en: "Must sign the adoption agreement",
            sort_order: 1,
            is_published: true,
          },
        ],
      },
    });
    const result = await repo.listAdmin({
      resource: "rules",
      q: undefined,
      animalType: undefined,
      page: 1,
      pageSize: 25,
    });
    expect(calls).toContainEqual({
      table: "adoption_rules",
      method: "select",
      payload: {
        columns: "id,content_zh,content_en,sort_order,is_published",
        options: { count: "exact" },
      },
    });
    expect(calls).toContainEqual({
      table: "adoption_rules",
      method: "range",
      payload: { from: 0, to: 24 },
    });
    expect(result).toEqual({
      resource: "rules",
      items: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          content: { "zh-HK": "必須簽署領養協議", en: "Must sign the adoption agreement" },
          sortOrder: 1,
          isPublished: true,
        },
      ],
      total: 2,
      page: 1,
      pageSize: 25,
    });
  });

  test("listAdmin({resource: 'careTopics'}) queries care_topics with the correct columns and animalType filter", async () => {
    const { calls, repo } = setup({
      rowsByTable: {
        care_topics: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            animal_type: "dog",
            label_zh: "餵食",
            label_en: "Feeding",
            content_zh: "每日餵食兩次",
            content_en: "Feed twice daily",
            sort_order: 1,
            is_published: true,
          },
        ],
      },
    });
    const result = await repo.listAdmin({
      resource: "careTopics",
      q: undefined,
      animalType: "dog",
      page: 1,
      pageSize: 25,
    });
    expect(calls).toContainEqual({
      table: "care_topics",
      method: "select",
      payload: {
        columns: "id,animal_type,label_zh,label_en,content_zh,content_en,sort_order,is_published",
        options: { count: "exact" },
      },
    });
    expect(calls).toContainEqual({
      table: "care_topics",
      method: "eq",
      payload: { column: "animal_type", value: "dog" },
    });
    expect(result.items).toEqual([
      {
        id: "77777777-7777-4777-8777-777777777777",
        animalType: "dog",
        label: { "zh-HK": "餵食", en: "Feeding" },
        content: { "zh-HK": "每日餵食兩次", en: "Feed twice daily" },
        sortOrder: 1,
        isPublished: true,
      },
    ]);
  });

  test("listAdmin({resource: 'careTopics'}) silently drops a malformed row instead of throwing", async () => {
    const { repo } = setup({
      rowsByTable: {
        care_topics: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            animal_type: "dog",
            label_zh: "餵食",
            // label_en is missing, so the row fails schema validation.
            content_zh: "每日餵食兩次",
            content_en: "Feed twice daily",
            sort_order: 1,
            is_published: true,
          },
        ],
      },
    });
    const result = await repo.listAdmin({
      resource: "careTopics",
      q: undefined,
      animalType: undefined,
      page: 1,
      pageSize: 25,
    });
    expect(result.items).toEqual([]);
  });
});
