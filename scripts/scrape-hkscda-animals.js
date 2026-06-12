/**
 * HKSCDA Animal Scraper  —  scripts/scrape-hkscda-animals.js
 *
 * Scrapes https://hkscda.com/animal/ for all cats and dogs using
 * a headed Playwright browser so you can solve Cloudflare manually.
 *
 * Outputs:
 *   data/hkscda-animals.json
 *   data/hkscda-animals.csv
 *   public/animals/hkscda/   (downloaded photos)
 *
 * Run:
 *   npm run scrape:hkscda
 *   node scripts/scrape-hkscda-animals.js
 */

import { chromium } from "playwright";
import fs from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import https from "node:https";
import http from "node:http";

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = "https://hkscda.com";
const START_URL = `${BASE_URL}/animal/`;
const IMG_DIR = path.join("public", "animals", "hkscda");
const DATA_DIR = "data";
const JSON_OUT = path.join(DATA_DIR, "hkscda-animals.json");
const CSV_OUT = path.join(DATA_DIR, "hkscda-animals.csv");

const PAGE_DELAY_MS = 2000;
const IMG_DELAY_MS = 600;
const CF_WAIT_MS = 5 * 60 * 1000;
const NAV_TIMEOUT_MS = 45_000;

// Chinese label → JSON field name
const LABEL_MAP = {
  名字: "name",
  性別: "gender",
  歲數: "age",
  年齡: "age",
  性格: "personality",
  健康情況: "healthCondition",
  健康狀況: "healthCondition",
  適合人士: "suitableAdopter",
  來源: "source",
  晶片: "chipStatus",
  絕育: "neuterStatus",
  備註: "remarks",
  備注: "remarks",
  領養狀態: "adoptionStatus",
  狀態: "adoptionStatus",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeFilename(type, slug, index, ext = "jpg") {
  const safe = String(slug)
    .replace(/[^a-z0-9一-鿿-]/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return `hkscda-${type}-${safe || index}-${index}.${ext}`;
}

async function downloadImage(url, destPath) {
  try {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    if (!url) return null;
    await new Promise((resolve, reject) => {
      const proto = url.startsWith("https") ? https : http;
      const req = proto.get(
        url,
        {
          timeout: 20_000,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; HKSCDAScraper/1.0)",
            Referer: BASE_URL,
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          const ws = createWriteStream(destPath);
          pipeline(res, ws).then(resolve).catch(reject);
        },
      );
      req.on("error", reject);
      req.setTimeout(20_000, () => req.destroy(new Error("timeout")));
    });
    return destPath;
  } catch (e) {
    console.error(`    ✗ Image failed: ${url} — ${e.message}`);
    return null;
  }
}

const CSV_FIELDS = [
  "sourceSite",
  "sourceUrl",
  "animalType",
  "name",
  "nameEn",
  "gender",
  "age",
  "personality",
  "healthCondition",
  "suitableAdopter",
  "source",
  "chipStatus",
  "neuterStatus",
  "remarks",
  "adoptionStatus",
  "mainPhotoUrl",
  "scrapedAt",
];

function csvRow(obj) {
  return CSV_FIELDS.map((f) => {
    const s = String(obj[f] ?? "").replace(/\r?\n/g, " ");
    return `"${s.replace(/"/g, '""')}"`;
  }).join(",");
}

// ── Cloudflare handling ──────────────────────────────────────────────────────

async function navigateAndWait(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  } catch (e) {
    if (e.message.includes("net::") || e.message.includes("ERR_")) {
      console.error(`    Nav error: ${e.message}`);
      return false;
    }
    // Timeout may still have loaded content — continue
  }

  const title = await page.title().catch(() => "");
  const hasCF =
    title.includes("Just a moment") ||
    (await page.$("#challenge-form, #challenge-running").catch(() => null)) !== null;

  if (hasCF) {
    console.log("\n  ┌──────────────────────────────────────────────────────────┐");
    console.log("  │  Cloudflare detected — please solve the challenge in the │");
    console.log("  │  browser window that opened. Waiting up to 5 minutes...  │");
    console.log("  └──────────────────────────────────────────────────────────┘\n");
    const deadline = Date.now() + CF_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(2500);
      const t = await page.title().catch(() => "");
      const gone =
        !t.includes("Just a moment") &&
        (await page.$("#challenge-form").catch(() => null)) === null;
      if (gone) {
        console.log("  ✓ Cloudflare challenge cleared.\n");
        break;
      }
    }
  }

  await page.waitForSelector("body", { timeout: 10_000 }).catch(() => {});
  await sleep(800);
  return true;
}

// ── Listing-page discovery ───────────────────────────────────────────────────

async function collectDetailUrls(page) {
  // Canonical listing pages to check
  const listingCandidates = [
    START_URL,
    `${BASE_URL}/animal/cat/`,
    `${BASE_URL}/animal/dog/`,
    `${BASE_URL}/animal/cat`,
    `${BASE_URL}/animal/dog`,
  ];

  const detailUrls = new Map(); // canonical URL → 'cat' | 'dog' | null

  for (const listingUrl of listingCandidates) {
    console.log(`  Scanning: ${listingUrl}`);
    const ok = await navigateAndWait(page, listingUrl);
    if (!ok) {
      await sleep(1000);
      continue;
    }

    const linksOnPage = await page
      .evaluate(
        (base) =>
          Array.from(document.querySelectorAll("a[href]"))
            .map((a) => a.href)
            .filter((h) => h.startsWith(base)),
        BASE_URL,
      )
      .catch(() => []);

    // Collect pagination links
    const pageLinks = linksOnPage.filter((h) => /[?&](page|p)=\d/.test(h) || /\/page\/\d+/.test(h));
    const pagesToScan = [listingUrl, ...pageLinks];

    for (const scanUrl of pagesToScan) {
      if (scanUrl !== listingUrl) {
        const pok = await navigateAndWait(page, scanUrl);
        if (!pok) continue;
      }

      const links = await page
        .evaluate(
          (base) =>
            Array.from(document.querySelectorAll("a[href]"))
              .map((a) => a.href)
              .filter((h) => h.startsWith(base)),
          BASE_URL,
        )
        .catch(() => []);

      for (const href of links) {
        const clean = href.split("?")[0].split("#")[0];
        let pathname = "";
        try {
          pathname = new URL(clean).pathname;
        } catch {
          continue;
        }

        // Match /animal/cat/slug or /animal/dog/slug (canonical detail pattern)
        const m = pathname.match(/^\/animals?\/(cat|dog)\/([^/]+)\/?$/i);
        if (m && !detailUrls.has(clean)) {
          detailUrls.set(clean, m[1].toLowerCase());
          continue;
        }

        // Broader: /animal/{section}/{slug} where section is unknown type
        const m2 = pathname.match(/^\/animals?\/([^/]+)\/([^/]+)\/?$/i);
        if (m2) {
          const maybeType = m2[1].toLowerCase();
          // Skip obviously non-animal sub-sections
          if (["adoption", "sponsor", "upload", "admin", "wp-content"].includes(maybeType))
            continue;
          if (!detailUrls.has(clean)) detailUrls.set(clean, null);
        }
      }

      if (scanUrl !== listingUrl) await sleep(PAGE_DELAY_MS);
    }

    await sleep(PAGE_DELAY_MS);
  }

  return detailUrls;
}

// ── Detail-page extraction ───────────────────────────────────────────────────

async function scrapeDetail(page, url, hintType) {
  const ok = await navigateAndWait(page, url);
  if (!ok) return null;

  const raw = await page
    .evaluate((labelMap) => {
      const result = {};
      const body = document.body;
      const allText = body.innerText || "";

      // Strategy 1: table rows / definition lists
      const candidates = [
        ...document.querySelectorAll("tr, dt"),
        ...document.querySelectorAll(
          '[class*="label"],[class*="field"],[class*="meta"],[class*="info-item"]',
        ),
      ];
      for (const el of candidates) {
        const txt = (el.innerText || "").trim();
        for (const [label, field] of Object.entries(labelMap)) {
          if (txt === label || txt.startsWith(label + "：") || txt.startsWith(label + ":")) {
            if (!result[field]) {
              const sib = el.nextElementSibling;
              result[field] = sib
                ? sib.innerText.trim()
                : txt
                    .slice(label.length)
                    .replace(/^[：:\s]+/, "")
                    .trim();
            }
          }
        }
      }

      // Strategy 2: regex over full page text
      for (const [label, field] of Object.entries(labelMap)) {
        if (!result[field]) {
          const re = new RegExp(`${label}[：:\\s]*([^\\n\\r]{1,200})`, "i");
          const m = allText.match(re);
          if (m) result[field] = m[1].trim();
        }
      }

      // Heading as name fallback
      if (!result.name) {
        const h = document.querySelector(
          "h1, h2, .animal-name, .pet-name, .entry-title, .page-title",
        );
        if (h) result.name = h.innerText.trim();
      }

      result._rawText = allText.slice(0, 4000);
      return result;
    }, LABEL_MAP)
    .catch(() => ({}));

  // Determine animal type
  let type = hintType;
  if (!type) {
    const pathname = (() => {
      try {
        return new URL(url).pathname;
      } catch {
        return url;
      }
    })();
    if (/\/cat\//i.test(pathname)) type = "cat";
    else if (/\/dog\//i.test(pathname)) type = "dog";
    else if (raw._rawText) {
      const txt = raw._rawText;
      const catHits = (txt.match(/貓|cat/gi) || []).length;
      const dogHits = (txt.match(/狗|dog/gi) || []).length;
      if (catHits > dogHits) type = "cat";
      else if (dogHits > catHits) type = "dog";
      // else remain null — logged for manual review
    }
  }

  // Parse name: separate Chinese and English parts
  let nameChinese = (raw.name || "").trim() || null;
  let nameEn = null;
  if (nameChinese) {
    const cjkRange = "[一-鿿㐀-䶿豈-﫿]";
    const cjkFirst = new RegExp(`^([${cjkRange.slice(1, -1)}\\s]+)\\s+([A-Za-z][A-Za-z\\s-]*)$`);
    const enFirst = new RegExp(`^([A-Za-z][A-Za-z\\s-]+)\\s+([${cjkRange.slice(1, -1)}].*)$`);
    const onlyEn = /^[A-Za-z\s'-]+$/;
    if (cjkFirst.test(nameChinese)) {
      const m = nameChinese.match(cjkFirst);
      nameChinese = m[1].trim();
      nameEn = m[2].trim();
    } else if (enFirst.test(nameChinese)) {
      const m = nameChinese.match(enFirst);
      nameEn = m[1].trim();
      nameChinese = m[2].trim();
    } else if (onlyEn.test(nameChinese)) {
      nameEn = nameChinese;
      nameChinese = null;
    }
  }

  // All image URLs on page (skip nav/logo/icon images)
  const allPhotoUrls = await page
    .evaluate(() => {
      const skip = /logo|icon|avatar|banner|bg|background|sprite|pixel|favicon|placeholder/i;
      return Array.from(document.querySelectorAll("img[src], img[data-src]"))
        .map((img) => img.dataset.src || img.src)
        .filter((src) => src && src.startsWith("http") && !skip.test(src))
        .map((src) => src.split("?")[0])
        .filter((v, i, a) => a.indexOf(v) === i);
    })
    .catch(() => []);

  return {
    sourceSite: "HKSCDA",
    sourceUrl: url,
    animalType: type,
    name: nameChinese,
    nameEn,
    gender: raw.gender || null,
    age: raw.age || null,
    personality: raw.personality || null,
    healthCondition: raw.healthCondition || null,
    suitableAdopter: raw.suitableAdopter || null,
    source: raw.source || null,
    chipStatus: raw.chipStatus || null,
    neuterStatus: raw.neuterStatus || null,
    remarks: raw.remarks || null,
    adoptionStatus: raw.adoptionStatus || null,
    mainPhotoUrl: allPhotoUrls[0] || null,
    allPhotoUrls,
    localPhotoPaths: [],
    rawText: raw._rawText || null,
    scrapedAt: new Date().toISOString(),
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(IMG_DIR, { recursive: true });

  let browser;
  try {
    browser = await chromium.launch({ headless: false, channel: "chrome", slowMo: 80 });
  } catch {
    browser = await chromium.launch({ headless: false, slowMo: 80 });
  }

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  const animals = [];
  let photosDownloaded = 0;
  let failed = 0;

  try {
    // Phase 1: discover animal detail pages
    console.log("\n[Phase 1] Discovering animal pages from", START_URL, "\n");
    const detailUrls = await collectDetailUrls(page);

    if (detailUrls.size === 0) {
      console.warn("\n⚠ No animal detail pages discovered.");
      console.warn("  The site may use a different URL structure than expected.");
      console.warn(
        "  Check the open browser window, navigate to an animal, and note the URL pattern.",
      );
      console.warn("  Then update the regex in collectDetailUrls() and re-run.\n");
      await browser.close();
      return;
    }
    console.log(`\n[Phase 1] Found ${detailUrls.size} animal page(s)\n`);

    // Phase 2: scrape each detail page
    console.log("[Phase 2] Scraping detail pages...\n");
    let idx = 0;
    for (const [url, hintType] of detailUrls) {
      idx++;
      process.stdout.write(`  [${String(idx).padStart(3)}/${detailUrls.size}] `);

      try {
        const animal = await scrapeDetail(page, url, hintType);
        if (!animal) {
          console.log(`✗ Navigation failed`);
          failed++;
          continue;
        }
        if (!animal.name && !animal.nameEn && (!animal.rawText || animal.rawText.length < 50)) {
          console.log(`✗ No data extracted`);
          failed++;
          continue;
        }

        // Download photos
        for (let pi = 0; pi < animal.allPhotoUrls.length; pi++) {
          const photoUrl = animal.allPhotoUrls[pi];
          await sleep(IMG_DELAY_MS);
          const slug = (animal.name || animal.nameEn || `animal${idx}`).slice(0, 40);
          const ext = (() => {
            const m = photoUrl.match(/\.(jpe?g|png|webp|gif)(\?|$)/i);
            return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
          })();
          const filename = safeFilename(animal.animalType || "unknown", slug, pi, ext);
          const destPath = path.join(IMG_DIR, filename);
          if (!existsSync(destPath)) {
            const result = await downloadImage(photoUrl, destPath);
            if (result) {
              photosDownloaded++;
              animal.localPhotoPaths.push(`/animals/hkscda/${filename}`);
            }
          } else {
            animal.localPhotoPaths.push(`/animals/hkscda/${filename}`);
          }
        }

        const displayName = (animal.name || animal.nameEn || "?").padEnd(14);
        console.log(
          `✓ ${displayName} | ${(animal.animalType || "?").padEnd(3)} | ${(animal.gender || "?").padEnd(12)} | ${animal.age || "?"}`,
        );
        animals.push(animal);
      } catch (e) {
        console.log(`✗ ${e.message}`);
        failed++;
      }

      await sleep(PAGE_DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  // Deduplicate by sourceUrl
  const seen = new Set();
  const deduped = animals.filter((a) => {
    if (seen.has(a.sourceUrl)) return false;
    seen.add(a.sourceUrl);
    return true;
  });

  // Write outputs
  await fs.writeFile(JSON_OUT, JSON.stringify(deduped, null, 2), "utf8");
  const csvHeader = CSV_FIELDS.map((f) => `"${f}"`).join(",");
  await fs.writeFile(CSV_OUT, [csvHeader, ...deduped.map(csvRow)].join("\n"), "utf8");

  const cats = deduped.filter((a) => a.animalType === "cat").length;
  const dogs = deduped.filter((a) => a.animalType === "dog").length;
  const unknown = deduped.length - cats - dogs;

  console.log("\n" + "═".repeat(60));
  console.log("Scrape complete.");
  console.log(`  Total animals  : ${deduped.length}`);
  console.log(`  Cats           : ${cats}`);
  console.log(`  Dogs           : ${dogs}`);
  console.log(
    `  Unknown type   : ${unknown}${unknown > 0 ? "  ← inspect rawText, set animalType" : ""}`,
  );
  console.log(`  Photos saved   : ${photosDownloaded}`);
  console.log(`  Skipped/failed : ${failed}`);
  console.log(`  JSON           : ${JSON_OUT}`);
  console.log(`  CSV            : ${CSV_OUT}`);
  console.log(`  Photos dir     : ${IMG_DIR}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
