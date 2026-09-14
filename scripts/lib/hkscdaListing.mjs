/**
 * Pure HTML parsing for hkscda.com's server-rendered animal listings.
 * Real card shape (verified 2026-09-14):
 *   <a href="/animal/id/<N>"> ... background-image:url('/HKSCDA/...jpeg')
 *   ... 名字: / 性別: / 年齡:
 */

export const SITE_ORIGIN = "https://hkscda.com";

function decodeEntities(value) {
  if (value == null) return null;
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function text(value) {
  const decoded = decodeEntities(value);
  if (decoded == null) return null;
  return decoded.replace(/\s+/g, " ").trim() || null;
}

function firstMatch(html, re) {
  const m = html.match(re);
  return m ? text(m[1]) : null;
}

export function parseListingHtml(html, type) {
  const cards = [];
  const seen = new Set();
  const anchorRe = /<a\s+href="\/animal\/id\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    const sourceId = m[1];
    if (seen.has(sourceId)) continue;
    const block = m[2];
    const name = firstMatch(block, /名字:\s*([^<]+)/);
    if (!name) continue;
    seen.add(sourceId);
    cards.push({
      sourceId,
      type,
      name,
      gender: firstMatch(block, /性別:\s*([^<]+)/),
      age: firstMatch(block, /年齡:\s*([^<]+)/),
      photoPath: decodeEntities(
        (block.match(/background-image:\s*url\('([^']+)'\)/) ?? [])[1] ?? null,
      ),
    });
  }
  return cards;
}

export function parseDetailHtml(html) {
  const photoPath =
    firstMatch(html, /<img[^>]*id="m-img"[^>]*src="([^"]+)"/) ??
    firstMatch(html, /<img[^>]*src="([^"]+)"[^>]*id="m-img"/);
  const field = (id) => firstMatch(html, new RegExp(`id="${id}"[^>]*>([^<]*)<`));
  return { photoPath, gender: field("m-gender"), age: field("m-age") };
}

export function parseTotalPages(html) {
  let max = 1;
  for (const m of html.matchAll(/\?page=(\d+)/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export function toAbsolutePhotoUrl(photoPath) {
  if (!photoPath) return null;
  if (/^https?:\/\//i.test(photoPath)) return photoPath;
  return SITE_ORIGIN + (photoPath.startsWith("/") ? photoPath : `/${photoPath}`);
}

export function extensionForContentType(contentType, url) {
  const ct = String(contentType ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const byType = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  if (byType[ct]) return byType[ct];
  const m = String(url ?? "").match(/\.(jpe?g|png|webp|gif|avif)(?:\?|$)/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

export function looksLikeChallenge(html, title = "") {
  return (
    /cf-chl|challenges\.cloudflare\.com|cf_chl_/i.test(html) ||
    /just a moment|請稍候|attention required/i.test(`${title}\n${html}`)
  );
}
