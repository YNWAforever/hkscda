import { describe, expect, mock, test } from "bun:test";

import { createSupabaseSearchGapRepository } from "./searchGapRepository.server";

type RpcResult = { data: unknown; error: { message: string } | null };

function createFakeClient(result: RpcResult = { data: null, error: null }) {
  const rpc = mock(async (_fn: string, _args?: Record<string, unknown>) => result);
  return { client: { rpc } as never, rpc };
}

const rpcError = { message: "rpc exploded" };

describe("createSupabaseSearchGapRepository", () => {
  test("record sends the topic, language and confidence to record_faq_search_gap", async () => {
    const { client, rpc } = createFakeClient();

    await createSupabaseSearchGapRepository(client).record({
      topic: "visa",
      language: "zh-HK",
      confidence: "low",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_faq_search_gap", {
      p_topic: "visa",
      p_language: "zh-HK",
      p_confidence: "low",
    });
  });

  test("list sends the window and limit, and maps rows to camelCase with a numeric count", async () => {
    const { client, rpc } = createFakeClient({
      data: [
        {
          topic: "x",
          language: "en",
          confidence: "low",
          search_count: "3",
          last_seen_day: "2026-10-08",
        },
      ],
      error: null,
    });

    const gaps = await createSupabaseSearchGapRepository(client).list(30, 100);

    expect(rpc).toHaveBeenCalledWith("list_faq_search_gaps", { p_days: 30, p_limit: 100 });
    expect(gaps).toEqual([
      { topic: "x", language: "en", confidence: "low", searchCount: 3, lastSeenDay: "2026-10-08" },
    ]);
  });

  test("list drops rows that fail to parse and treats a null result as empty", async () => {
    const valid = {
      topic: "ok",
      language: "zh-HK",
      confidence: "none",
      search_count: 2,
      last_seen_day: "2026-10-07",
    };
    const { client } = createFakeClient({
      data: [valid, { ...valid, topic: "bad", confidence: "high" }, { topic: "partial" }],
      error: null,
    });
    const repo = createSupabaseSearchGapRepository(client);

    expect(await repo.list(30, 100)).toEqual([
      {
        topic: "ok",
        language: "zh-HK",
        confidence: "none",
        searchCount: 2,
        lastSeenDay: "2026-10-07",
      },
    ]);

    const empty = createFakeClient({ data: null, error: null });
    expect(await createSupabaseSearchGapRepository(empty.client).list(30, 100)).toEqual([]);
  });

  test("purge calls purge_faq_search_gaps and returns the deleted count", async () => {
    const { client, rpc } = createFakeClient({ data: 7, error: null });

    const deleted = await createSupabaseSearchGapRepository(client).purge();

    expect(rpc).toHaveBeenCalledWith("purge_faq_search_gaps");
    expect(deleted).toBe(7);
  });

  test("purge rejects when the database returns something other than a count", async () => {
    for (const data of [null, "7", -1, 1.5]) {
      const { client } = createFakeClient({ data, error: null });

      await expect(createSupabaseSearchGapRepository(client).purge()).rejects.toThrow(
        "purge_faq_search_gaps returned an invalid count",
      );
    }
  });

  test("an RPC error rejects every method", async () => {
    const { client } = createFakeClient({ data: null, error: rpcError });
    const repo = createSupabaseSearchGapRepository(client);

    await expect(repo.record({ topic: "visa", language: "en", confidence: "none" })).rejects.toBe(
      rpcError,
    );
    await expect(repo.list(30, 100)).rejects.toBe(rpcError);
    await expect(repo.purge()).rejects.toBe(rpcError);
  });
});
