#!/usr/bin/env node
/**
 * Fails if demonstration content is published on the target site.
 *
 * The 2026-09-11 audit found seven published demonstration items. A later
 * read confirmed those seven were the ONLY content_item rows in production, so
 * the entire public stories section was fabricated -- fake rescue stories and a
 * fake charity market under a real animal-rescue charity's name.
 *
 * Nothing was checking for that, which is why it persisted. This is the check.
 *
 * Read-only: it selects id, title, slug and status and writes nothing. Point it
 * at an environment with:
 *
 *   CONTENT_CHECK_URL=... CONTENT_CHECK_KEY=... node scripts/verify-no-demo-content.mjs
 *
 * Exits 0 when clean, 1 when published demonstration content is found, and 2
 * when it could not check -- an unreachable target must never be mistaken for a
 * clean result.
 */
import { isDemoContent } from "../src/lib/content/demoContent.ts";

const url = process.env.CONTENT_CHECK_URL;
const key = process.env.CONTENT_CHECK_KEY;

if (!url || !key) {
  console.error("✗ CONTENT_CHECK_URL and CONTENT_CHECK_KEY are required.");
  console.error("  Both are read-only uses; this script never writes.");
  process.exit(2);
}

const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/content_item?select=id,title,slug,status&limit=1000`;

let rows;
try {
  const response = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    console.error(`✗ Could not read content_item (HTTP ${response.status}).`);
    process.exit(2);
  }
  rows = await response.json();
} catch (error) {
  console.error(`✗ Could not reach the target: ${error instanceof Error ? error.message : error}`);
  process.exit(2);
}

const published = rows.filter((row) => row.status === "published");
const offending = published.filter((row) => isDemoContent(row));

console.log(`content_item rows: ${rows.length} (published: ${published.length})`);

if (offending.length === 0) {
  console.log("✓ No demonstration content is published.");
  process.exit(0);
}

console.error(
  `\n✗ ${offending.length} demonstration item(s) are PUBLISHED and publicly visible:\n`,
);
for (const row of offending) {
  console.error(`   ${row.id}  ${row.slug ?? "(no slug)"}  ${row.title ?? "(no title)"}`);
}
console.error(
  "\nUnpublish them or replace them with verified authentic content. Preserve the\n" +
    "records rather than deleting them, and do not simply remove the 【示範】 label:\n" +
    "the slug marks them too, and this check reads both.",
);
process.exit(1);
