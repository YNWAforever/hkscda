/**
 * HKSCDA live-listing scraper  —  scripts/scrape-hkscda-listing.mjs
 *
 * Fetches https://hkscda.com/animals/{cat,dog} (server-rendered HTML),
 * follows pagination, falls back to the detail page when a card has no photo,
 * and writes data/hkscda-live.json.
 *
 * Run:  node scripts/scrape-hkscda-listing.mjs   (or: bun run scrape:hkscda)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  looksLikeChallenge,
  parseDetailHtml,
  parseListingHtml,
  parseTotalPages,
  SITE_ORIGIN,
} from "./lib/hkscdaListing.mjs";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const DATA_DIR = "data";
const OUT_FILE = path.join(DATA_DIR, "hkscda-live.json");
const PAGE_DELAY_MS = 400;
const MAX_PAGES = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ChallengeError extends Error {}

export async function fetchHtml(fetchImpl, url, type) {
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "zh-HK,zh;q=0.9",
      Referer: `${SITE_ORIGIN}/animals/${type}`,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  if (looksLikeChallenge(html)) throw new ChallengeError(`Cloudflare challenge at ${url}`);
  return html;
}

export async function collectListing({
  fetchImpl = fetch,
  origin = SITE_ORIGIN,
  sleepImpl = sleep,
  maxPages = MAX_PAGES,
  onProgress = () => {},
} = {}) {
  const animals = [];
  for (const type of ["cat", "dog"]) {
    let page = 1;
    let totalPages = 1;
    for (;;) {
      const url = `${origin}/animals/${type}${page > 1 ? `?page=${page}` : ""}`;
      const html = await fetchHtml(fetchImpl, url, type);
      const cards = parseListingHtml(html, type);
      onProgress(`${type} page ${page}: ${cards.length} card(s)`);
      if (cards.length === 0) break;

      for (const card of cards) {
        if (!card.photoPath) {
          try {
            const detailHtml = await fetchHtml(fetchImpl, `${origin}/animal/id/${card.sourceId}`, type);
            card.photoPath = parseDetailHtml(detailHtml).photoPath;
          } catch (error) {
            if (error instanceof ChallengeError) throw error;
            // Leave null; the applier reports it rather than failing the run.
          }
          await sleepImpl(PAGE_DELAY_MS);
        }
        animals.push(card);
      }

      totalPages = parseTotalPages(html);
      if (page >= Math.min(totalPages, maxPages)) break;
      page += 1;
      await sleepImpl(PAGE_DELAY_MS);
    }
  }
  return animals;
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const animals = await collectListing({ onProgress: (m) => console.log(`  ${m}`) });
  await fs.writeFile(OUT_FILE, `${JSON.stringify(animals, null, 2)}\n`, "utf8");
  const cats = animals.filter((a) => a.type === "cat").length;
  const dogs = animals.filter((a) => a.type === "dog").length;
  const withPhoto = animals.filter((a) => a.photoPath).length;
  console.log(`\nScraped ${animals.length} animals (${cats} cats, ${dogs} dogs); ${withPhoto} with a photo.`);
  console.log(`Wrote ${OUT_FILE}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("Fatal:", e.message);
    process.exit(1);
  });
}
