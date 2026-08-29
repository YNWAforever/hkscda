import { describe, expect, test } from "bun:test";

import { createSupabaseFaqRepository } from "./repository.server";
import type { FaqEntryInput } from "./types";

const actorId = "11111111-1111-4111-8111-111111111111";
const entryId = "22222222-2222-4222-8222-222222222222";

function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: entryId,
    category: "sponsorship",
    question_zh: "問題",
    question_en: "Question",
    answer_zh: "答案",
    answer_en: "Answer",
    keywords_zh: ["助養"],
    keywords_en: ["sponsor"],
    cta_key: "view_sponsor_animals",
    sensitive: false,
    sort_order: 0,
    is_active: true,
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

function inputFor(entry: ReturnType<typeof entryRow>): FaqEntryInput {
  return {
    category: entry.category as FaqEntryInput["category"],
    questionZh: entry.question_zh,
    questionEn: entry.question_en,
    answerZh: entry.answer_zh,
    answerEn: entry.answer_en,
    keywordsZh: entry.keywords_zh,
    keywordsEn: entry.keywords_en,
    ctaKey: entry.cta_key,
    sensitive: entry.sensitive,
    sortOrder: entry.sort_order,
    isActive: entry.is_active,
  };
}

function createFakeClient(
  overrides: {
    faqRows?: ReturnType<typeof entryRow>[];
    rpcResult?: unknown;
    rpcError?: { message: string } | null;
  } = {},
) {
  const faqRows = overrides.faqRows ?? [entryRow()];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];

  return {
    client: {
      from(table: string) {
        if (table !== "faq_entry") throw new Error(`Unexpected table: ${table}`);
        return {
          select: () => ({
            eq: (_col: string, value: boolean) => ({
              order: () => ({
                order: () => ({
                  then: (resolve: (result: { data: unknown; error: unknown }) => void) =>
                    resolve({
                      data: faqRows.filter((row) => row.is_active === value),
                      error: null,
                    }),
                }),
              }),
            }),
            order: () => ({
              order: () => ({
                then: (resolve: (result: { data: unknown; error: unknown }) => void) =>
                  resolve({ data: faqRows, error: null }),
              }),
            }),
          }),
        };
      },
      rpc: (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return Promise.resolve({
          data: overrides.rpcResult ?? entryRow(),
          error: overrides.rpcError ?? null,
        });
      },
    },
    rpcCalls,
  };
}

describe("createSupabaseFaqRepository", () => {
  test("listPublic returns only active entries, mapped to the public HelpFaq shape with CTA resolved", async () => {
    const { client } = createFakeClient({
      faqRows: [entryRow({ is_active: true }), entryRow({ id: "3", is_active: false })],
    });
    const repo = createSupabaseFaqRepository(client as never);
    const faqs = await repo.listPublic();

    expect(faqs).toHaveLength(1);
    expect(faqs[0]?.id).toBe(entryId);
    expect(faqs[0]?.cta?.href).toBe("/sponsors");
    expect(faqs[0]?.sensitive).toBe(false);
  });

  test("listAdmin returns every entry (active and inactive), ordered", async () => {
    const { client } = createFakeClient({
      faqRows: [entryRow({ is_active: true }), entryRow({ id: "3", is_active: false })],
    });
    const repo = createSupabaseFaqRepository(client as never);
    const entries = await repo.listAdmin();
    expect(entries).toHaveLength(2);
  });

  test("upsert calls the upsert_faq_entry_with_audit RPC with the actor id and mapped fields, including is_active", async () => {
    const { client, rpcCalls } = createFakeClient();
    const repo = createSupabaseFaqRepository(client as never);
    const input = inputFor(entryRow());

    const result = await repo.upsert(input, actorId);

    expect(result.id).toBe(entryId);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.fn).toBe("upsert_faq_entry_with_audit");
    expect(rpcCalls[0]?.args).toEqual({
      p_actor_user_id: actorId,
      p_id: null,
      p_category: "sponsorship",
      p_question_zh: "問題",
      p_question_en: "Question",
      p_answer_zh: "答案",
      p_answer_en: "Answer",
      p_keywords_zh: ["助養"],
      p_keywords_en: ["sponsor"],
      p_cta_key: "view_sponsor_animals",
      p_sensitive: false,
      p_sort_order: 0,
      p_is_active: true,
    });
  });

  test("upsert with an id passes p_id through instead of null", async () => {
    const { client, rpcCalls } = createFakeClient();
    const repo = createSupabaseFaqRepository(client as never);
    await repo.upsert({ ...inputFor(entryRow()), id: entryId }, actorId);
    expect((rpcCalls[0]?.args as { p_id: string | null }).p_id).toBe(entryId);
  });

  test("upsert with isActive: false passes p_is_active: false through (reactivation/deactivation via the edit form)", async () => {
    const { client, rpcCalls } = createFakeClient();
    const repo = createSupabaseFaqRepository(client as never);
    await repo.upsert({ ...inputFor(entryRow()), isActive: false }, actorId);
    expect((rpcCalls[0]?.args as { p_is_active: boolean }).p_is_active).toBe(false);
  });

  test("upsert throws when the RPC returns an error", async () => {
    const { client } = createFakeClient({ rpcError: { message: "boom" } });
    const repo = createSupabaseFaqRepository(client as never);
    await expect(repo.upsert(inputFor(entryRow()), actorId)).rejects.toBeTruthy();
  });

  test("deactivate calls the deactivate_faq_entry_with_audit RPC", async () => {
    const { client, rpcCalls } = createFakeClient({ rpcResult: null });
    const repo = createSupabaseFaqRepository(client as never);
    await repo.deactivate(entryId, actorId);
    expect(rpcCalls[0]?.fn).toBe("deactivate_faq_entry_with_audit");
    expect(rpcCalls[0]?.args).toEqual({ p_actor_user_id: actorId, p_id: entryId });
  });

  test("deactivate throws when the RPC returns an error", async () => {
    const { client } = createFakeClient({ rpcResult: null, rpcError: { message: "boom" } });
    const repo = createSupabaseFaqRepository(client as never);
    await expect(repo.deactivate(entryId, actorId)).rejects.toBeTruthy();
  });
});
