import { describe, expect, test } from "bun:test";
import { createSponsorshipTermsHandler } from "./terms";

const request = new Request("https://example.test/api/sponsorships/terms?language=en");

describe("public sponsorship terms", () => {
  test("serves only a published document for the requested language", async () => {
    const response = await createSponsorshipTermsHandler(async (language) => {
      expect(language).toBe("en");
      return {
        version: "v1",
        title: "Approved terms",
        documentUrl: "https://example.test/terms.pdf",
        documentDate: "2026-09-27T00:00:00Z",
      };
    })(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).terms.version).toBe("v1");
  });
  test("returns unavailable without inventing terms, and fails closed on read errors", async () => {
    const absent = await createSponsorshipTermsHandler(async () => null)(request);
    expect(await absent.json()).toEqual({ available: false });
    const failed = await createSponsorshipTermsHandler(
      async () => {
        throw new Error("database unavailable");
      },
      { error: () => {} },
    )(request);
    expect(failed.status).toBe(503);
    expect((await failed.json()).available).toBe(false);
  });
});
