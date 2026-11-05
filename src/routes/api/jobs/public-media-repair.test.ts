import { describe, expect, test } from "bun:test";

import { createPublicMediaRepairHandler } from "./public-media-repair";

const request = (token?: string) =>
  new Request("https://example.test/api/jobs/public-media-repair", {
    headers: token ? { authorization: "Bearer " + token } : {},
  });

describe("frequent public media repair cron", () => {
  test("rejects unauthorized and missing-secret calls before service client creation", async () => {
    let clients = 0;
    const make = (secret: string | undefined) =>
      createPublicMediaRepairHandler({
        secret: () => secret,
        createClient: () => {
          clients++;
          return {} as never;
        },
      });
    expect((await make("cron-secret")(request())).status).toBe(401);
    expect((await make(undefined)(request("cron-secret"))).status).toBe(401);
    expect(clients).toBe(0);
  });

  test("runs both repair domains with no-store results", async () => {
    const calls: string[] = [];
    const handler = createPublicMediaRepairHandler({
      secret: () => "cron-secret",
      createClient: () => ({}) as never,
      runAnimal: async () => {
        calls.push("animal");
        return { copied: 2, failed: 0 };
      },
      runContent: async () => {
        calls.push("content");
        return { copied: 3, failed: 0 };
      },
      runContentWithdrawal: async () => {
        calls.push("content withdrawal");
        return { removed: 4, failed: 0 };
      },
    });
    const response = await handler(request("cron-secret"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      animal: { copied: 2, failed: 0 },
      content: { copied: 3, failed: 0 },
      contentWithdrawal: { removed: 4, failed: 0 },
    });
    expect(calls).toEqual(["animal", "content", "content withdrawal"]);
  });

  test("one failure does not suppress the other domain and alerts scheduler", async () => {
    const handler = createPublicMediaRepairHandler({
      secret: () => "cron-secret",
      createClient: () => ({}) as never,
      runAnimal: async () => {
        throw new Error("storage unavailable");
      },
      runContent: async () => ({ copied: 1, failed: 0 }),
      runContentWithdrawal: async () => ({ removed: 1, failed: 0 }),
      logger: { error: () => {} },
    });
    const response = await handler(request("cron-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      animal: null,
      content: { copied: 1, failed: 0 },
      contentWithdrawal: { removed: 1, failed: 0 },
    });
  });

  // BUG-72: the same authenticated daily run withdraws public copies a story no longer uses.
  test("BUG-72: a content withdrawal failure alerts the scheduler without stopping repair", async () => {
    const errors: unknown[] = [];
    const handler = createPublicMediaRepairHandler({
      secret: () => "cron-secret",
      createClient: () => ({}) as never,
      runAnimal: async () => ({ copied: 0, failed: 0 }),
      runContent: async () => ({ copied: 2, failed: 0 }),
      runContentWithdrawal: async () => {
        throw new Error("storage unavailable");
      },
      logger: { error: (...args: unknown[]) => errors.push(args) },
    });
    const response = await handler(request("cron-secret"));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      animal: { copied: 0, failed: 0 },
      content: { copied: 2, failed: 0 },
      contentWithdrawal: null,
    });
    expect(errors).toHaveLength(1);
  });

  test("BUG-72: copies left for the next run make the scheduler retry", async () => {
    const handler = createPublicMediaRepairHandler({
      secret: () => "cron-secret",
      createClient: () => ({}) as never,
      runAnimal: async () => ({ copied: 0, failed: 0 }),
      runContent: async () => ({ copied: 0, failed: 0 }),
      runContentWithdrawal: async () => ({ removed: 1, failed: 1 }),
    });
    const response = await handler(request("cron-secret"));
    expect(response.status).toBe(500);
    expect((await response.json()).contentWithdrawal).toEqual({ removed: 1, failed: 1 });
  });

  test("BUG-72: withdrawal never runs without the cron secret", async () => {
    let withdrawals = 0;
    const handler = createPublicMediaRepairHandler({
      secret: () => "cron-secret",
      createClient: () => ({}) as never,
      runContentWithdrawal: async () => {
        withdrawals++;
        return { removed: 0, failed: 0 };
      },
    });
    expect((await handler(request("wrong-secret"))).status).toBe(401);
    expect(withdrawals).toBe(0);
  });
});
