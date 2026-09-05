import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createSupabaseContentLifecycleRepository,
  mapContentLifecycleRepositoryError,
} from "./lifecycle.repository.server";

const actorUserId = "7d3ec361-f0a0-4300-8808-c34ed4e86542";
const contentId = "73cc7721-cb1e-4f01-8f21-7a1f1c37e2ae";
const revisionId = "c3644738-7ea4-4a38-8e6e-46b5b6a44a4b";

function createClient(result: { data: unknown; error: unknown }) {
  const rpc = mock(async () => result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("content lifecycle repository", () => {
  test("creates draft and audit in one RPC", async () => {
    const { client, rpc } = createClient({
      data: { content_id: contentId, version: 1, revision_id: revisionId },
      error: null,
    });
    const repository = createSupabaseContentLifecycleRepository(client);
    await repository.create({ actorUserId, values: { title: "Draft" } });
    expect(rpc).toHaveBeenCalledWith("create_content_revision_with_audit", {
      p_actor_user_id: actorUserId,
      p_values: { title: "Draft" },
    });
  });
  test("sends a validated authoring mutation through one RPC", async () => {
    const { client, rpc } = createClient({
      data: { content_id: contentId, version: 8, revision_id: revisionId },
      error: null,
    });
    const repository = createSupabaseContentLifecycleRepository(client);

    await expect(
      repository.mutate({
        actorUserId,
        contentId,
        expectedVersion: 7,
        operation: "save_content",
        values: { title: "已儲存草稿" },
      }),
    ).resolves.toEqual({ contentId, version: 8, revisionId });
    expect(rpc).toHaveBeenCalledWith("mutate_content_revision_with_audit", {
      p_actor_user_id: actorUserId,
      p_content_id: contentId,
      p_expected_version: 7,
      p_operation: "save_content",
      p_values: { title: "已儲存草稿" },
    });
  });

  test("publishes a selected revision with version and idempotency guards", async () => {
    const { client, rpc } = createClient({
      data: { content_id: contentId, version: 9, revision_id: revisionId },
      error: null,
    });
    const repository = createSupabaseContentLifecycleRepository(client);

    await repository.publish({
      actorUserId,
      contentId,
      revisionId,
      expectedVersion: 8,
      idempotencyKey: "content-publish-00000001",
    });

    expect(rpc).toHaveBeenCalledWith("publish_content_revision", {
      p_actor_user_id: actorUserId,
      p_content_id: contentId,
      p_revision_id: revisionId,
      p_expected_version: 8,
      p_idempotency_key: "content-publish-00000001",
    });
  });

  test("restores history as a new draft revision", async () => {
    const { client, rpc } = createClient({
      data: { content_id: contentId, version: 10, revision_id: revisionId },
      error: null,
    });
    const repository = createSupabaseContentLifecycleRepository(client);

    await repository.restore({ actorUserId, contentId, revisionId, expectedVersion: 9 });

    expect(rpc).toHaveBeenCalledWith("restore_content_revision", {
      p_actor_user_id: actorUserId,
      p_content_id: contentId,
      p_revision_id: revisionId,
      p_expected_version: 9,
    });
  });

  test("maps database concurrency, missing, and validation errors", () => {
    expect(mapContentLifecycleRepositoryError({ code: "40001" }).code).toBe("conflict");
    expect(mapContentLifecycleRepositoryError({ code: "P0002" }).code).toBe("not_found");
    expect(mapContentLifecycleRepositoryError({ code: "23514" }).code).toBe("invalid");
  });

  test("rejects malformed RPC results", async () => {
    const { client } = createClient({ data: { version: "8" }, error: null });
    const repository = createSupabaseContentLifecycleRepository(client);
    await expect(
      repository.restore({ actorUserId, contentId, revisionId, expectedVersion: 7 }),
    ).rejects.toMatchObject({ code: "internal", status: 500 });
  });
});

test("revision history is capped and paged before returning rows", async () => {
  const calls: string[] = [];
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: (value: number) => {
      calls.push(`limit:${value}`);
      return query;
    },
    lt: (field: string, value: number) => {
      calls.push(`${field}<${value}`);
      return query;
    },
    then: (resolve: (data: unknown) => unknown) =>
      Promise.resolve(resolve({ data: [], error: null })),
  };
  const repository = createSupabaseContentLifecycleRepository({
    from: () => query,
  } as unknown as SupabaseClient);
  expect(await repository.listRevisions(contentId, 42)).toEqual([]);
  expect(calls).toEqual(["limit:20", "version<42"]);
});
