import { describe, expect, test } from "bun:test";

import {
  extensionForContentType,
  looksLikeChallenge,
  parseDetailHtml,
  parseListingHtml,
  parseTotalPages,
  toAbsolutePhotoUrl,
} from "./hkscdaListing.mjs";

const LISTING_HTML = `
<div class="col-6 col-md-3">
  <a href="/animal/id/5309" class="animal card d-block">
    <div class="animal-img" style="background-image:url('/HKSCDA/storage/app/public/animals/zyAL.jpeg')"></div>
    <div class="row align-items-center">
      <div class="paw"><img src='/img/paw.png'/></div>
      <div class="animal-info col-9">
        <p class="animal-name">名字: 肥黑 &amp; 仔</p>
        <p>性別: 男</p>
        <p>年齡: 11歲</p>
      </div>
    </div>
  </a>
</div>
<div class="col-6 col-md-3">
  <a href="/animal/id/5306" class="animal card d-block">
    <div class="animal-img"></div>
    <p class="animal-name">名字: 芳糖</p>
    <p>性別: 女</p>
    <p>年齡: 3個月</p>
  </a>
</div>
<ul class="pagination">
  <li><a href="https://hkscda.com/animals/cat?page=2">2</a></li>
  <li><a href="https://hkscda.com/animals/cat?page=8">8</a></li>
</ul>
`;

describe("parseListingHtml", () => {
  test("extracts cards with numeric id, name, gender, age and photo path", () => {
    const cards = parseListingHtml(LISTING_HTML, "cat");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      sourceId: "5309",
      type: "cat",
      name: "肥黑 & 仔",
      gender: "男",
      age: "11歲",
      photoPath: "/HKSCDA/storage/app/public/animals/zyAL.jpeg",
    });
    expect(cards[1].photoPath).toBeNull();
  });
});

describe("parseTotalPages", () => {
  test("returns the highest page number, or 1 when absent", () => {
    expect(parseTotalPages(LISTING_HTML)).toBe(8);
    expect(parseTotalPages("<html></html>")).toBe(1);
  });
});

describe("parseDetailHtml", () => {
  test("reads the main image and the labelled fields", () => {
    const html = `
      <img id="m-img" src="/HKSCDA/storage/app/public/animals/zyAL.jpeg" width="100%" />
      <p id="m-gender" class="col-8">男</p>
      <p id="m-age" class="col-8">11歲</p>`;
    expect(parseDetailHtml(html)).toEqual({
      photoPath: "/HKSCDA/storage/app/public/animals/zyAL.jpeg",
      gender: "男",
      age: "11歲",
    });
  });
});

describe("toAbsolutePhotoUrl", () => {
  test("prefixes relative paths and leaves absolute urls alone", () => {
    expect(toAbsolutePhotoUrl("/HKSCDA/a.jpeg")).toBe(
      "https://hkscda.com/HKSCDA/a.jpeg",
    );
    expect(toAbsolutePhotoUrl("https://cdn.example/a.jpeg")).toBe("https://cdn.example/a.jpeg");
    expect(toAbsolutePhotoUrl(null)).toBeNull();
  });
});

describe("extensionForContentType", () => {
  test("prefers the content type, falls back to the url suffix", () => {
    expect(extensionForContentType("image/jpeg; charset=binary", null)).toBe("jpg");
    expect(extensionForContentType("image/png", null)).toBe("png");
    expect(extensionForContentType(null, "https://x/a.webp?x=1")).toBe("webp");
    expect(extensionForContentType(null, null)).toBe("jpg");
  });
});

describe("looksLikeChallenge", () => {
  test("detects a Cloudflare interstitial", () => {
    expect(looksLikeChallenge("<html>cf-chl</html>")).toBe(true);
    expect(looksLikeChallenge("<html>Just a moment...</html>")).toBe(true);
    expect(looksLikeChallenge("<html>動物資料</html>")).toBe(false);
  });
});
