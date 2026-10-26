import { describe, expect, test } from "bun:test";
import { createNotificationRetryHandler } from "./notificationRetry.server";

const actor = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const request = () => new Request("https://example.invalid/api/admin/volunteers/jobs/" + id);

describe("notification job retry HTTP boundary", () => {
  test("returns an auth denial without calling the RPC", async () => {
    let calls = 0;
    const response = await createNotificationRetryHandler({
      authorize: async () => {
        throw new Response("Forbidden", { status: 403 });
      },
      retry: async () => {
        calls++;
        return true;
      },
    })(request(), id);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(calls).toBe(0);
  });
  test("queues a true acknowledgement and conflicts on false", async () => {
    const calls: unknown[] = [];
    const handler = createNotificationRetryHandler({
      authorize: async () => ({ authUserId: actor }),
      retry: async (jobId, actorId) => {
        calls.push({ jobId, actorId });
        return calls.length === 1;
      },
    });
    const queued = await handler(request(), id);
    expect(queued.status).toBe(200);
    expect(await queued.json()).toEqual({ kind: "queued" });
    const conflict = await handler(request(), id);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ kind: "conflict" });
    expect(calls).toEqual([
      { jobId: id, actorId: actor },
      { jobId: id, actorId: actor },
    ]);
  });
  test("rejects an id that is not a uuid before the RPC", async () => {
    let calls = 0;
    const response = await createNotificationRetryHandler({
      authorize: async () => ({ authUserId: actor }),
      retry: async () => {
        calls++;
        return true;
      },
    })(request(), "not-a-uuid");
    expect(response.status).toBe(400);
    expect(calls).toBe(0);
  });
  for (const [code, status] of [
    ["PGRST202", 503],
    ["42883", 503],
    ["42501", 403],
    ["22P02", 400],
    ["22023", 400],
    ["P0001", 500],
  ] as const) {
    test(`RPC rejection ${code} fails closed without private response text`, async () => {
      const response = await createNotificationRetryHandler({
        authorize: async () => ({ authUserId: actor }),
        retry: async () => {
          throw { code, message: "synthetic-private-provider-error" };
        },
      })(request(), id);
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.text();
      expect(body).not.toContain("synthetic-private");
      expect(body).toContain(
        code === "42501"
          ? "volunteer_notification_retry_forbidden"
          : code === "22P02" || code === "22023"
            ? "volunteer_notification_retry_invalid"
            : code === "P0001"
              ? "volunteer_notification_retry_failed"
              : "volunteer_notification_retry_unavailable",
      );
    });
  }
  test("a non-boolean acknowledgement is unavailable", async () => {
    const response = await createNotificationRetryHandler({
      authorize: async () => ({ authUserId: actor }),
      retry: async () => "true",
    })(request(), id);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "volunteer_notification_retry_unavailable",
      code: "volunteer_notification_retry_unavailable",
    });
  });
});
