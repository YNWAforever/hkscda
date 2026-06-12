/**
 * HKSCDA adoption-listing scraper
 *
 * Scrapes https://hkscda.com/animals/cat and /animals/dog, downloads photos,
 * and writes data/hkscda_animals.{csv,json}.
 *
 * Strategy (the site sits behind a Cloudflare challenge):
 *   1. Plain static fetch — works only if Cloudflare lets the request through.
 *   2. Headless Playwright reusing a saved session (data/.cf-state.json).
 *   3. Headed Playwright — solve the Cloudflare challenge manually once;
 *      the session is saved so later runs go back to step 2.
 *
 * Run: bun run scrape:hkscda   (or: node scripts/scrape-hkscda.js)
 * Flags: --fresh   ignore the saved Cloudflare session
 *        --no-details   skip visiting per-animal detail pages
 */

import { chromium } from "playwright";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const BASE = "https://hkscda.com";
const CATEGORIES = [
  { type: "cat", url: `${BASE}/animals/cat` },
  { type: "dog", url: `${BASE}/animals/dog` },
];

const DATA_DIR = "data";
const IMG_DIR = path.join("public", "animals", "images");
const STATE_FILE = path.join(DATA_DIR, ".cf-state.json");
const CSV_FILE = path.join(DATA_DIR, "hkscda_animals.csv");
const JSON_FILE = path.join(DATA_DIR, "hkscda_animals.json");

const PAGE_DELAY_MS = 1500; // between page navigations — be gentle
const IMG_DELAY_MS = 400; // between image downloads
const MAX_PAGES_PER_CATEGORY = 20; // pagination safety cap
const MAX_EXTRA_PHOTOS = 2; // extra photos per detail page
const CHALLENGE_TIMEOUT_MS = 180_000; // 3 min for the manual Cloudflare pass

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const FRESH = process.argv.includes("--fresh");
const SKIP_DETAILS = process.argv.includes("--no-details");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function looksLikeChallenge(html, title = "") {
  return (
    /cf-chl|challenges\.cloudflare\.com|cf_chl_/i.test(html) ||
    /just a moment|請稍候|attention required/i.test(title || html)
  );
}

/* ---------------------------------------------------------------- DOM scrape
 * Runs inside the page. Finds "cards": smallest containers that hold an <img>
 * plus label text (名字/性別/年齡), falling back to any same-origin link
 * wrapping an image outside nav/header/footer.
 */
function extractCardsInPage() {
  const abs = (u) => {
    try {
      return u ? new URL(u, location.href).href : null;
    } catch {
      return null;
    }
  };
  const imgSrc = (img) => {
    if (!img) return null;
    const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
    if (srcset) {
      const last = srcset.split(",").pop();
      if (last) return abs(last.trim().split(/\s+/)[0]);
    }
    return abs(img.currentSrc || img.src || img.getAttribute("data-src"));
  };
  const inChrome = (el) => !!el.closest("nav,header,footer");

  const roots = new Set();

  // Pass 1: label-anchored cards
  const labelRe = /名字|性別|年齡/;
  for (const el of document.querySelectorAll("main *, body *")) {
    if (el.childElementCount === 0 && labelRe.test(el.textContent || "") && !inChrome(el)) {
      let node = el.parentElement;
      for (let i = 0; i < 7 && node && node !== document.body; i++) {
        if (node.querySelector("img")) {
          roots.add(node);
          break;
        }
        node = node.parentElement;
      }
    }
  }

  // Pass 2 (fallback): same-origin links that wrap an image
  if (roots.size === 0) {
    for (const a of document.querySelectorAll("a[href]")) {
      if (inChrome(a) || !a.querySelector("img")) continue;
      const href = abs(a.getAttribute("href"));
      if (href && href.startsWith(location.origin)) roots.add(a);
    }
  }

  // Drop roots that contain another root (keep the innermost card)
  const list = [...roots].filter((r) => ![...roots].some((o) => o !== r && r.contains(o)));

  return list.map((root) => {
    const img = root.querySelector("img");
    const link =
      root.tagName === "A" ? root : root.querySelector("a[href]") || root.closest("a[href]");
    return {
      text: root.innerText || root.textContent || "",
      imgAlt: img?.getAttribute("alt") || null,
      photoUrl: imgSrc(img),
      detailUrl: link ? abs(link.getAttribute("href")) : null,
    };
  });
}

function findNextPageInPage() {
  const abs = (u) => {
    try {
      return u ? new URL(u, location.href).href : null;
    } catch {
      return null;
    }
  };
  const rel = document.querySelector("a[rel='next']");
  if (rel) return abs(rel.getAttribute("href"));
  for (const a of document.querySelectorAll("a[href]")) {
    const t = (a.innerText || "").trim();
    if (/^(下一頁|下一页|下頁|Next|›|»|>)$/i.test(t) && !a.getAttribute("aria-disabled")) {
      return abs(a.getAttribute("href"));
    }
  }
  return null;
}

function extractDetailInPage() {
  const abs = (u) => {
    try {
      return u ? new URL(u, location.href).href : null;
    } catch {
      return null;
    }
  };
  const photos = [];
  for (const img of document.querySelectorAll("main img, article img, body img")) {
    if (img.closest("nav,header,footer")) continue;
    const src = abs(img.currentSrc || img.src || img.getAttribute("data-src"));
    if (!src || /logo|icon|avatar|favicon/i.test(src)) continue;
    const w = img.naturalWidth || parseInt(img.getAttribute("width") || "0", 10);
    if (w && w < 100) continue; // skip thumbnails/decorations
    if (!photos.includes(src)) photos.push(src);
  }
  return { text: document.body.innerText || "", photos };
}

/* ------------------------------------------------------------- text parsing */
function parseField(text, label) {
  // "名字：Mochi" / "名字: Mochi" / "名字 Mochi" — value runs to end of line
  const m = text.match(new RegExp(`${label}\\s*[:：]?\\s*([^\\n\\r]+)`));
  return m ? m[1].trim().replace(/\s{2,}.*$/, "") || null : null;
}

function parseCard(card, type) {
  const text = card.text || "";
  let name = parseField(text, "名字");
  if (!name) {
    // fall back to the image alt or the first short non-label line
    name =
      card.imgAlt ||
      text
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l && l.length <= 40 && !/名字|性別|年齡|領養|HK\$/.test(l)) ||
      null;
  }
  let gender = parseField(text, "性別");
  if (!gender) gender = (text.match(/(?:^|\s)(公|母)(?:$|\s|，)/) || [])[1] || null;
  const age = parseField(text, "年齡");

  return {
    type,
    name,
    gender,
    age,
    detail_url: card.detailUrl,
    photo_url: card.photoUrl,
    local_image: null,
    extra_images: [],
  };
}

/* ------------------------------------------------------------------ outputs */
function safeFilename(s, fallback) {
  const cleaned = (s || "")
    .normalize("NFKC")
    .replace(/[^\w一-鿿-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || fallback;
}

function extFor(url, contentType) {
  const byType = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
  };
  if (contentType && byType[contentType.split(";")[0].trim()]) {
    return byType[contentType.split(";")[0].trim()];
  }
  const m = (url || "").match(/\.(jpe?g|png|webp|gif|avif)(?:\?|$)/i);
  return m ? `.${m[1].toLowerCase().replace("jpeg", "jpg")}` : ".jpg";
}

function toCsv(rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "type",
    "name",
    "gender",
    "age",
    "detail_url",
    "photo_url",
    "local_image",
    "extra_images",
  ];
  return [
    header.join(","),
    ...rows.map((r) =>
      header.map((h) => esc(h === "extra_images" ? (r[h] || []).join("|") : r[h])).join(","),
    ),
  ].join("\n");
}

/* ----------------------------------------------------------------- fetchers */
async function tryStatic(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "zh-HK,zh;q=0.9,en;q=0.8" },
    });
    const html = await res.text();
    if (!res.ok || looksLikeChallenge(html)) return null;
    return html;
  } catch {
    return null;
  }
}

async function waitForContentOrChallenge(page) {
  // Resolves true when cards/images are present, false on timeout.
  try {
    await page.waitForFunction(
      () => {
        const t = document.title || "";
        if (/just a moment|請稍候/i.test(t)) return false; // still challenged
        const txt = document.body?.innerText || "";
        return (
          /名字|性別|年齡/.test(txt) ||
          document.querySelectorAll("main img, article img").length > 0
        );
      },
      { timeout: CHALLENGE_TIMEOUT_MS, polling: 1000 },
    );
    return true;
  } catch {
    return false;
  }
}

async function launchBrowser(headless) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent: headless ? UA : undefined, // headed: keep the real browser UA for the challenge
    locale: "zh-HK",
    viewport: { width: 1366, height: 900 },
    storageState: !FRESH && existsSync(STATE_FILE) ? STATE_FILE : undefined,
  });
  return { browser, context };
}

/* --------------------------------------------------------------------- main */
async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(IMG_DIR, { recursive: true });

  let browser = null;
  let context = null;
  let mode = "static";

  // Acquire a working page-loading strategy using the first category URL.
  const probeUrl = CATEGORIES[0].url;
  const staticOk = (await tryStatic(probeUrl)) !== null;

  if (staticOk) {
    console.log("✓ Static fetch works — no Cloudflare challenge right now.");
    // Still drive everything through headless Playwright for uniform DOM parsing.
    ({ browser, context } = await launchBrowser(true));
    mode = "headless";
  } else {
    console.log("✗ Static fetch blocked (Cloudflare challenge).");
    if (!FRESH && existsSync(STATE_FILE)) {
      console.log("→ Trying headless with the saved session (data/.cf-state.json)…");
      ({ browser, context } = await launchBrowser(true));
      const page = await context.newPage();
      await page.goto(probeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
      const ok = await page
        .waitForFunction(() => !/just a moment|請稍候/i.test(document.title || ""), {
          timeout: 15_000,
        })
        .then(() => true)
        .catch(() => false);
      await page.close();
      if (ok) {
        mode = "headless+session";
        console.log("✓ Saved session still valid.");
      } else {
        await browser.close();
        browser = null;
      }
    }
    if (!browser) {
      console.log("→ Opening a visible browser window.");
      console.log("  ┌─────────────────────────────────────────────────────────┐");
      console.log("  │  If a Cloudflare challenge appears, solve it manually.  │");
      console.log("  │  The scraper continues automatically once it clears.    │");
      console.log("  └─────────────────────────────────────────────────────────┘");
      ({ browser, context } = await launchBrowser(false));
      mode = "headed";
    }
  }

  const page = await context.newPage();
  const animals = [];

  try {
    for (const { type, url } of CATEGORIES) {
      let pageUrl = url;
      let pageNo = 1;

      while (pageUrl && pageNo <= MAX_PAGES_PER_CATEGORY) {
        console.log(`\n[${type}] page ${pageNo}: ${pageUrl}`);
        await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

        const ready = await waitForContentOrChallenge(page);
        if (!ready) {
          console.warn(`  ! Timed out waiting for content on ${pageUrl} — skipping.`);
          break;
        }
        // Persist the session as soon as we're through the challenge.
        await context.storageState({ path: STATE_FILE });

        const cards = await page.evaluate(extractCardsInPage);
        console.log(`  ${cards.length} card(s) found`);
        for (const card of cards) animals.push(parseCard(card, type));

        const next = await page.evaluate(findNextPageInPage);
        pageUrl = next && next !== pageUrl && next.startsWith(BASE) ? next : null;
        pageNo += 1;
        if (pageUrl) await sleep(PAGE_DELAY_MS);
      }
      await sleep(PAGE_DELAY_MS);
    }

    // Detail pages: fill in missing fields, pick up extra photos.
    if (!SKIP_DETAILS) {
      const withDetails = animals.filter(
        (a) =>
          a.detail_url &&
          a.detail_url.startsWith(BASE) &&
          !CATEGORIES.some((c) => a.detail_url === c.url),
      );
      console.log(`\nVisiting ${withDetails.length} detail page(s)…`);
      for (const a of withDetails) {
        await sleep(PAGE_DELAY_MS);
        try {
          await page.goto(a.detail_url, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
          const detail = await page.evaluate(extractDetailInPage);
          a.name = a.name || parseField(detail.text, "名字");
          a.gender = a.gender || parseField(detail.text, "性別");
          a.age = a.age || parseField(detail.text, "年齡");
          if (!a.photo_url && detail.photos.length > 0) a.photo_url = detail.photos[0];
          a.extra_images = detail.photos
            .filter((p) => p !== a.photo_url)
            .slice(0, MAX_EXTRA_PHOTOS);
          console.log(`  ✓ ${a.name || a.detail_url}`);
        } catch (err) {
          console.warn(`  ! ${a.detail_url}: ${err.message}`);
        }
      }
    }

    // Download photos through the browser context (carries Cloudflare cookies).
    console.log("\nDownloading images…");
    for (let i = 0; i < animals.length; i++) {
      const a = animals[i];
      const base = `${a.type}-${String(i + 1).padStart(3, "0")}-${safeFilename(a.name, "unnamed")}`;
      const targets = [a.photo_url, ...a.extra_images].filter(Boolean);
      const saved = [];
      for (let j = 0; j < targets.length; j++) {
        const url = targets[j];
        try {
          const resp = await context.request.get(url, { timeout: 30_000 });
          if (!resp.ok()) throw new Error(`HTTP ${resp.status()}`);
          const ext = extFor(url, resp.headers()["content-type"]);
          const fname = j === 0 ? `${base}${ext}` : `${base}-${j}${ext}`;
          await fs.writeFile(path.join(IMG_DIR, fname), await resp.body());
          saved.push(fname);
        } catch (err) {
          console.warn(`  ! image ${url}: ${err.message}`);
        }
        await sleep(IMG_DELAY_MS);
      }
      a.local_image = saved[0] || null;
      a.extra_images = saved.slice(1);
      if (saved.length) console.log(`  ✓ ${saved.join(", ")}`);
    }
  } finally {
    await browser.close();
  }

  await fs.writeFile(JSON_FILE, JSON.stringify(animals, null, 2));
  await fs.writeFile(CSV_FILE, toCsv(animals) + "\n");

  console.log(`\nDone (mode: ${mode}).`);
  console.log(`  ${animals.length} animal(s) → ${CSV_FILE}, ${JSON_FILE}`);
  console.log(`  images → ${IMG_DIR}/`);
  if (animals.length === 0) {
    console.log("\n⚠ No cards were extracted. The page structure may not match the");
    console.log("  heuristics in extractCardsInPage() — inspect the DOM and adjust");
    console.log("  the selectors there.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
