import { describe, expect, test } from "bun:test";

import { createPublicUploadCleanupHandler } from "./public-uploads";

const request = (token?: string) =>
  new Request("https://example.test/api/jobs/public-uploads", {
    headers: token ? { authorization: "Bearer " + token } : {},
  });

describe("public upload cleanup cron", () => {
  test("rejects unauthenticated requests without creating a service client", async () => {
    let clients = 0;
    const handler = createPublicUploadCleanupHandler({
      secret: () => "cron-secret",
      createClient: () => {
        clients += 1;
        return {} as never;
      },
    });
    expect((await handler(request())).status).toBe(401);
    expect(clients).toBe(0);
  });

  test("fails closed when the cron secret is unconfigured", async () => {
    const handler = createPublicUploadCleanupHandler({
      secret: () => undefined,
      createClient: () => {
        throw new Error("must not create service client");
      },
    });
    expect((await handler(request())).status).toBe(401);
  });

  test("runs all cleanup domains on the existing daily schedule", async () => {
    const calls: string[] = [];
    const handler = createPublicUploadCleanupHandler({
      secret: () => "cron-secret",
      createClient: () => ({}) as never,
      runAdoption: async () => {
        calls.push("adoption");
        return { removed: 1, preserved: 0, failed: 0 };
      },
      runSponsorship: async () => {
        calls.push("sponsorship");
        return { removed: 2, preserved: 1, failed: 0 };
      },
      runInternship: async () => {
        calls.push("internship");
        return { removed: 3, preserved: 0, failed: 0 };
      },
    });
    const response = await handler(request("cron-secret"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      adoption: { removed: 1, preserved: 0, failed: 0 },
      sponsorship: { removed: 2, preserved: 1, failed: 0 },
      internship: { removed: 3, preserved: 0, failed: 0 },
    });
    expect(calls).toEqual(["adoption", "sponsorship", "internship"]);
  });

  test("one failing cleanup does not suppress the other", async () => {
    const calls: string[] = [];
    const handler = createPublicUploadCleanupHandler({
      secret: () => "cron-secret",
      createClient: () => ({}) as never,
      runAdoption: async () => {
        calls.push("adoption");
        throw new Error("adoption unavailable");
      },
      runSponsorship: async () => {
        calls.push("sponsorship");
        return { removed: 1, preserved: 0, failed: 0 };
      },
      runInternship: async () => {
        calls.push("internship");
        return { removed: 0, preserved: 0, failed: 0 };
      },
      logger: { error: () => {} },
    });
    const response = await handler(request("cron-secret"));
    expect(response.status).toBe(500);
    expect(calls).toEqual(["adoption", "sponsorship", "internship"]);
  });

  test("reports item-level cleanup failures to the scheduler", async () => {
    const handler = createPublicUploadCleanupHandler({
      secret: () => "cron-secret",
      createClient: () => ({}) as never,
      runAdoption: async () => ({ removed: 0, preserved: 0, failed: 0 }),
      runSponsorship: async () => ({ removed: 0, preserved: 0, failed: 0 }),
      runInternship: async () => ({ removed: 0, preserved: 0, failed: 1 }),
    });
    const response = await handler(request("cron-secret"));
    expect(response.status).toBe(500);
    expect((await response.json()).internship.failed).toBe(1);
  });
});
