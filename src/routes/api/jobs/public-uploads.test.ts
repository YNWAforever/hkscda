import { describe, expect, test } from "bun:test";

import { createPublicUploadCleanupHandler } from "./public-uploads";

const request = (token?: string) =>
  new Request("https://example.test/api/jobs/public-uploads", {
    headers: token ? { authorization: "Bearer " + token } : {},
  });
const clean = { removed: 0, preserved: 0, failed: 0 };

describe("daily public upload orphan cleanup", () => {
  test("rejects unauthenticated requests before creating a service client", async () => {
    let clients = 0;
    const handler = createPublicUploadCleanupHandler({
      secret: () => "cron-secret",
      createClient: () => {
        clients++;
        return {} as never;
      },
    });
    expect((await handler(request())).status).toBe(401);
    expect(clients).toBe(0);
  });

  test("fails closed without CRON_SECRET", async () => {
    const handler = createPublicUploadCleanupHandler({
      secret: () => undefined,
      createClient: () => {
        throw new Error("must not create service client");
      },
    });
    expect((await handler(request())).status).toBe(401);
  });

  test("runs only daily orphan cleanup domains", async () => {
    const calls: string[] = [];
    const handler = createPublicUploadCleanupHandler({
      secret: () => "cron-secret",
      createClient: () => ({}) as never,
      runAdoption: async () => {
        calls.push("adoption");
        return clean;
      },
      runSponsorship: async () => {
        calls.push("sponsorship");
        return clean;
      },
      runInternship: async () => {
        calls.push("internship");
        return clean;
      },
      runAnimalDraft: async () => {
        calls.push("animalDraft");
        return { removed: 0, failed: 0 };
      },
      runFaqSearchGapPurge: async () => {
        calls.push("faqSearchGaps");
        return clean;
      },
    });
    const response = await handler(request("cron-secret"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      adoption: clean,
      sponsorship: clean,
      internship: clean,
      animalDraft: { removed: 0, failed: 0 },
      faqSearchGaps: clean,
    });
    expect(calls).toEqual([
      "adoption",
      "sponsorship",
      "internship",
      "animalDraft",
      "faqSearchGaps",
    ]);
  });

  test("one failed cleanup still allows the others and returns 500", async () => {
    const calls: string[] = [];
    const handler = createPublicUploadCleanupHandler({
      secret: () => "cron-secret",
      createClient: () => ({}) as never,
      runAdoption: async () => {
        calls.push("adoption");
        throw new Error("down");
      },
      runSponsorship: async () => {
        calls.push("sponsorship");
        return clean;
      },
      runInternship: async () => {
        calls.push("internship");
        return clean;
      },
      runAnimalDraft: async () => {
        calls.push("animalDraft");
        return { removed: 0, failed: 0 };
      },
      runFaqSearchGapPurge: async () => {
        calls.push("faqSearchGaps");
        return clean;
      },
      logger: { error: () => {} },
    });
    const response = await handler(request("cron-secret"));
    expect(response.status).toBe(500);
    expect((await response.json()).adoption).toBeNull();
    expect(calls).toEqual([
      "adoption",
      "sponsorship",
      "internship",
      "animalDraft",
      "faqSearchGaps",
    ]);
  });

  test("reports the number of removed FAQ search gap rows", async () => {
    const handler = createPublicUploadCleanupHandler({
      secret: () => "cron-secret",
      createClient: () => ({}) as never,
      runAdoption: async () => clean,
      runSponsorship: async () => clean,
      runInternship: async () => clean,
      runAnimalDraft: async () => ({ removed: 0, failed: 0 }),
      runFaqSearchGapPurge: async () => ({ removed: 2, preserved: 0, failed: 0 }),
    });
    const response = await handler(request("cron-secret"));
    expect(response.status).toBe(200);
    expect((await response.json()).faqSearchGaps).toEqual({
      removed: 2,
      preserved: 0,
      failed: 0,
    });
  });

  test("a failed FAQ search gap purge is logged, returns 500 and leaves the other cleanups running", async () => {
    const calls: string[] = [];
    const errors: unknown[][] = [];
    const failure = new Error("rpc down");
    const handler = createPublicUploadCleanupHandler({
      secret: () => "cron-secret",
      createClient: () => ({}) as never,
      runAdoption: async () => {
        calls.push("adoption");
        return clean;
      },
      runSponsorship: async () => {
        calls.push("sponsorship");
        return clean;
      },
      runInternship: async () => {
        calls.push("internship");
        return clean;
      },
      runAnimalDraft: async () => {
        calls.push("animalDraft");
        return { removed: 0, failed: 0 };
      },
      runFaqSearchGapPurge: async () => {
        calls.push("faqSearchGaps");
        throw failure;
      },
      logger: { error: (...args: unknown[]) => void errors.push(args) },
    });
    const response = await handler(request("cron-secret"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.faqSearchGaps).toBeNull();
    expect(body.adoption).toEqual(clean);
    expect(calls).toEqual([
      "adoption",
      "sponsorship",
      "internship",
      "animalDraft",
      "faqSearchGaps",
    ]);
    expect(errors).toEqual([["FAQ search gap purge failed", failure]]);
  });
});
