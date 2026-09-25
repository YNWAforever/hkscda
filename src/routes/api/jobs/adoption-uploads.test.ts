import { describe, expect, test } from "bun:test";

import { createAdoptionUploadCleanupHandler } from "./adoption-uploads";

const request = (token?: string) =>
  new Request("https://example.test/api/jobs/adoption-uploads", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("adoption upload cleanup cron", () => {
  test("fails closed without a configured secret and does not create a service client", async () => {
    let creates = 0;
    const handler = createAdoptionUploadCleanupHandler({
      secret: () => undefined,
      createClient: () => {
        creates += 1;
        return {} as never;
      },
    });
    const response = await handler(request());
    expect(response.status).toBe(401);
    expect(creates).toBe(0);
  });

  test("requires the matching bearer secret", async () => {
    let creates = 0;
    const handler = createAdoptionUploadCleanupHandler({
      secret: () => "cron-secret",
      createClient: () => {
        creates += 1;
        return {} as never;
      },
    });
    expect((await handler(request("wrong"))).status).toBe(401);
    expect(creates).toBe(0);
  });

  test("runs cleanup after authorization and returns a non-cacheable summary", async () => {
    const calls: string[] = [];
    const handler = createAdoptionUploadCleanupHandler({
      secret: () => "cron-secret",
      createClient: () => {
        calls.push("client");
        return {} as never;
      },
      createPort: () => {
        calls.push("port");
        return {} as never;
      },
      cleanup: async () => {
        calls.push("cleanup");
        return { removed: 2, preserved: 1, failed: 0 };
      },
    });
    const response = await handler(request("cron-secret"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ removed: 2, preserved: 1, failed: 0 });
    expect(calls).toEqual(["client", "port", "cleanup"]);
  });
});
