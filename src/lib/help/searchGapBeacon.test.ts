import { describe, expect, mock, test } from "bun:test";

import { reportSearchGap } from "./searchGapBeacon";

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

// `typeof fetch` carries extra members (`preconnect`) a plain mock lacks.
function createFetch(impl: FetchImpl = () => Promise.resolve(new Response(null))) {
  const fetch = mock(impl);
  return { fetch, deps: { fetch: fetch as unknown as typeof globalThis.fetch } };
}

describe("reportSearchGap", () => {
  test.each(["none", "low"] as const)("sends one beacon for %s confidence", (confidence) => {
    const { fetch, deps } = createFetch();

    reportSearchGap({ query: "visa", language: "en", confidence }, deps);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("/api/help/search-gap");
    expect(init?.method).toBe("POST");
    expect(init?.keepalive).toBe(true);
    // No cookies, and no Referer header: the page path is never sent.
    expect(init?.credentials).toBe("omit");
    expect(init?.referrerPolicy).toBe("no-referrer");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({ topic: "visa", language: "en", confidence });
  });

  test("sends exactly topic, language and confidence, and never the raw query", () => {
    const { fetch, deps } = createFetch();
    const query = "  How Do I Adopt A Dog?! ";

    reportSearchGap({ query, language: "zh-HK", confidence: "none" }, deps);

    const [, init] = fetch.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["confidence", "language", "topic"]);
    expect(body.topic).toBe("how do i adopt a dog");
    expect(body.topic).not.toBe(query);
    expect(String(init?.body)).not.toContain("How Do I Adopt");
  });

  test.each(["medium", "high"] as const)("does not send for %s confidence", (confidence) => {
    const { fetch, deps } = createFetch();

    reportSearchGap({ query: "visa", language: "en", confidence }, deps);

    expect(fetch).not.toHaveBeenCalled();
  });

  test.each(["my phone is 91234567", "donor@example.com", "   "])(
    "does not send for the redacted or empty query %p",
    (query) => {
      const { fetch, deps } = createFetch();

      reportSearchGap({ query, language: "en", confidence: "none" }, deps);

      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("swallows a fetch that rejects", async () => {
    const { fetch, deps } = createFetch(() => Promise.reject(new Error("offline")));

    expect(() =>
      reportSearchGap({ query: "visa", language: "en", confidence: "none" }, deps),
    ).not.toThrow();

    // Let the microtask queue drain: an unhandled rejection would surface here.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("swallows a fetch that throws synchronously", () => {
    const { fetch, deps } = createFetch(() => {
      throw new TypeError("fetch is not available");
    });

    expect(() =>
      reportSearchGap({ query: "visa", language: "en", confidence: "low" }, deps),
    ).not.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
