import { describe, expect, test } from "bun:test";

import { ChallengeError, collectListing, fetchHtml } from "./scrape-hkscda-listing.mjs";

const page1 = `
<a href="/animal/id/1" class="animal card d-block">
  <div class="animal-img" style="background-image:url('/HKSCDA/a.jpeg')"></div>
  <p class="animal-name">名字: 甲</p><p>性別: 男</p><p>年齡: 1歲</p>
</a>
<a href="https://hkscda.com/animals/cat?page=2">2</a>`;

const page2 = `
<a href="/animal/id/2" class="animal card d-block">
  <div class="animal-img"></div>
  <p class="animal-name">名字: 乙</p><p>性別: 女</p><p>年齡: 2歲</p>
</a>`;

const detail2 = `
<img id="m-img" src="/HKSCDA/b.jpeg" />
<p id="m-gender" class="col-8">女</p><p id="m-age" class="col-8">2歲</p>`;

function fakeFetch(routes: Record<string, string>) {
  return async (url: string) => {
    const body = routes[url];
    if (body == null) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => body };
  };
}

describe("fetchHtml", () => {
  test("throws on a non-OK response", async () => {
    const fetchImpl = fakeFetch({});
    await expect(fetchHtml(fetchImpl, "https://hkscda.com/animals/cat", "cat")).rejects.toThrow(
      "HTTP 404",
    );
  });

  test("throws when the body is a Cloudflare challenge", async () => {
    const fetchImpl = fakeFetch({ "https://hkscda.com/animals/cat": "cf-chl" });
    await expect(fetchHtml(fetchImpl, "https://hkscda.com/animals/cat", "cat")).rejects.toThrow(
      "Cloudflare",
    );
  });
});

describe("collectListing", () => {
  test("paginates, then falls back to the detail page when a card has no photo", async () => {
    const routes: Record<string, string> = {
      "https://hkscda.com/animals/cat": page1,
      "https://hkscda.com/animals/cat?page=2": page2,
      "https://hkscda.com/animals/dog": "",
      "https://hkscda.com/animal/id/2": detail2,
    };
    const result = await collectListing({
      fetchImpl: fakeFetch(routes),
      sleepImpl: async () => {},
    });
    expect(result.map((a) => a.sourceId)).toEqual(["1", "2"]);
    expect(result[0].photoPath).toBe("/HKSCDA/a.jpeg");
    expect(result[1].photoPath).toBe("/HKSCDA/b.jpeg");
  });

  test("rejects when a species page 1 parses zero cards but pagination reports more pages", async () => {
    const routes: Record<string, string> = {
      "https://hkscda.com/animals/cat": `<a href="https://hkscda.com/animals/cat?page=2">2</a>`,
      "https://hkscda.com/animals/dog": "",
    };
    await expect(
      collectListing({ fetchImpl: fakeFetch(routes), sleepImpl: async () => {} }),
    ).rejects.toThrow("Markup drift");
  });

  test("rejects when both listings parse zero cards", async () => {
    const routes: Record<string, string> = {
      "https://hkscda.com/animals/cat": "",
      "https://hkscda.com/animals/dog": "",
    };
    await expect(
      collectListing({ fetchImpl: fakeFetch(routes), sleepImpl: async () => {} }),
    ).rejects.toThrow("No animals parsed");
  });

  test("aborts when a detail-page fallback hits a Cloudflare challenge", async () => {
    const routes: Record<string, string> = {
      "https://hkscda.com/animals/cat": page2,
      "https://hkscda.com/animals/dog": "",
      "https://hkscda.com/animal/id/2": "cf-chl",
    };
    await expect(
      collectListing({ fetchImpl: fakeFetch(routes), sleepImpl: async () => {} }),
    ).rejects.toThrow(ChallengeError);
  });
});
