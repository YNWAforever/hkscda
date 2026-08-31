import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, mock, test } from "bun:test";

import {
  createSupabasePaymentPublicConfigRepository,
  PaymentPublicConfigError,
} from "./repository.server";

const BASE_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  method: "fps",
  is_publicly_visible: true,
  display_label_zh: "轉數快 FPS",
  display_label_en: "FPS",
  sort_order: 2,
  details: {},
  state: "draft",
  version: 1,
  created_by: "22222222-2222-2222-2222-222222222222",
  updated_by: "22222222-2222-2222-2222-222222222222",
  submitted_by: null,
  submitted_at: null,
  published_by: null,
  published_at: null,
  archived_by: null,
  archived_at: null,
  created_at: "2026-08-31T00:00:00+00:00",
  updated_at: "2026-08-31T00:00:00+00:00",
};

function fakeClient({
  rpcData,
  rpcError,
  listData,
  listCount,
  listError,
  getData,
  getError,
}: {
  rpcData?: unknown;
  rpcError?: unknown;
  listData?: unknown[];
  listCount?: number;
  listError?: unknown;
  getData?: unknown;
  getError?: unknown;
} = {}) {
  const rpc = mock(async () => ({ data: rpcData ?? null, error: rpcError ?? null }));
  const listResult = { data: listData ?? [], count: listCount ?? 0, error: listError ?? null };
  const listBuilder: Record<string, unknown> = {
    order: () => listBuilder,
    range: () => listBuilder,
    then: (resolve: (value: typeof listResult) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(listResult).then(resolve, reject),
  };
  const eq = mock(() => listBuilder);
  listBuilder.eq = eq;
  const getBuilder = {
    eq: () => getBuilder,
    maybeSingle: () => Promise.resolve({ data: getData ?? null, error: getError ?? null }),
  };
  const client = {
    rpc,
    from: () => ({
      select: (_columns: string, options?: { count?: string }) =>
        options?.count ? listBuilder : getBuilder,
    }),
  } as unknown as SupabaseClient;
  return { client, eq };
}

describe("createSupabasePaymentPublicConfigRepository", () => {
  test("create() calls the mutation RPC and maps the returned row", async () => {
    const { client } = fakeClient({ rpcData: BASE_ROW });
    const repository = createSupabasePaymentPublicConfigRepository(client);
    const result = await repository.create(
      {
        method: "fps",
        isPubliclyVisible: true,
        displayLabelZh: "轉數快 FPS",
        displayLabelEn: "FPS",
        sortOrder: 2,
        details: {},
      },
      "22222222-2222-2222-2222-222222222222",
    );
    expect(result.method).toBe("fps");
    expect(client.rpc).toHaveBeenCalledWith(
      "mutate_payment_public_config_with_audit",
      expect.objectContaining({ p_operation: "create" }),
    );
  });

  test("publish() maps a same-actor rejection (42501) to a forbidden error", async () => {
    const { client } = fakeClient({
      rpcError: {
        code: "42501",
        message: "A different treasurer or admin must publish this change",
      },
    });
    const repository = createSupabasePaymentPublicConfigRepository(client);
    try {
      await repository.publish({
        id: BASE_ROW.id,
        expectedVersion: 1,
        actorUserId: "same-actor",
        idempotencyKey: "a".repeat(32),
      });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentPublicConfigError);
      expect((error as PaymentPublicConfigError).code).toBe("forbidden");
      expect((error as PaymentPublicConfigError).status).toBe(403);
    }
  });

  test("publish() maps a stale-version error (40001) to a conflict", async () => {
    const { client } = fakeClient({
      rpcError: { code: "40001", message: "Stale payment public config version" },
    });
    const repository = createSupabasePaymentPublicConfigRepository(client);
    try {
      await repository.publish({
        id: BASE_ROW.id,
        expectedVersion: 1,
        actorUserId: "actor",
        idempotencyKey: "a".repeat(32),
      });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentPublicConfigError);
      expect((error as PaymentPublicConfigError).code).toBe("conflict");
    }
  });

  test("getById() returns null when no row matches", async () => {
    const { client } = fakeClient({ getData: null });
    const repository = createSupabasePaymentPublicConfigRepository(client);
    expect(await repository.getById(BASE_ROW.id)).toBeNull();
  });

  test("list() returns mapped items with pagination metadata", async () => {
    const { client } = fakeClient({ listData: [BASE_ROW], listCount: 1 });
    const repository = createSupabasePaymentPublicConfigRepository(client);
    const result = await repository.list({ page: 1, pageSize: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.items[0]?.method).toBe("fps");
  });

  test("list() applies method and state filters via eq()", async () => {
    const { client, eq } = fakeClient({ listData: [BASE_ROW], listCount: 1 });
    const repository = createSupabasePaymentPublicConfigRepository(client);
    await repository.list({ page: 1, pageSize: 20, method: "fps", state: "draft" });
    expect(eq).toHaveBeenCalledWith("method", "fps");
    expect(eq).toHaveBeenCalledWith("state", "draft");
  });
});
