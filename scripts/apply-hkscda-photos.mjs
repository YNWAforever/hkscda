/**
 * HKSCDA photo backfill applier  —  scripts/apply-hkscda-photos.mjs
 *
 * Reads data/hkscda-live.json, matches it against the production `animals`
 * table, re-hosts each photo in the public `animal-images` bucket and sets
 * `image_url` only where it is currently null.
 *
 * Dry-run is the default. To write:
 *   node scripts/apply-hkscda-photos.mjs --apply --yes
 *
 * Reads VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env / .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runBackfill } from "./lib/hkscdaBackfill.mjs";
import { downscalePhoto } from "./lib/hkscdaImage.mjs";
import { extractProjectRef, PRODUCTION_PROJECT_REF } from "./seed-admin.js";

const LIVE_FILE = path.join("data", "hkscda-live.json");
const OVERRIDES_FILE = path.join("scripts", "hkscda-photo-overrides.json");
const MANIFEST_JSON = path.join("data", "hkscda-photo-manifest.json");
const MANIFEST_CSV = path.join("data", "hkscda-photo-manifest.csv");
const MAX_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_DELAY_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readEnv() {
  const merged = {};
  for (const file of [".env", ".env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.trim().match(/^([^#=][^=]*?)\s*=\s*(.*)$/);
      if (m) merged[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return { ...merged, ...process.env };
}

export function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    yes: argv.includes("--yes"),
    overwrite: argv.includes("--overwrite"),
  };
}

export function checkRunGuard({ dryRun, yes }) {
  if (dryRun) return null;
  if (!yes) {
    return "Refusing to write without --yes (or an interactive confirmation).";
  }
  return null;
}

export async function downloadPhoto(fetchImpl, url, { retries = 1, sleepImpl = sleep } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    let res;
    try {
      res = await fetchImpl(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
          Referer: "https://hkscda.com/animals",
        },
      });
    } catch (error) {
      if (attempt < retries) {
        await sleepImpl(DOWNLOAD_DELAY_MS);
        continue;
      }
      throw error;
    }
    if (!res.ok) {
      if (res.status >= 500 && attempt < retries) {
        await sleepImpl(DOWNLOAD_DELAY_MS);
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`not an image (${contentType || "no content-type"}) for ${url}`);
    }
    const contentLength = res.headers.get("content-length");
    if (contentLength != null && Number(contentLength) > MAX_BYTES) {
      throw new Error(`image too large (${contentLength} bytes) for ${url}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
      throw new Error(`image too large (${buffer.byteLength} bytes) for ${url}`);
    }
    return { bytes: buffer, contentType };
  }
}

export function toCsv(rows) {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const escape = (value) => {
    const s = value == null ? "" : Array.isArray(value) ? value.join("|") : String(value);
    return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  };
  return [columns.map((c) => `"${c}"`).join(","), ...rows.map((r) => columns.map((c) => escape(r[c])).join(","))].join("\n");
}

async function loadOverrides() {
  if (!existsSync(OVERRIDES_FILE)) return new Map();
  const parsed = JSON.parse(await fs.readFile(OVERRIDES_FILE, "utf8"));
  return new Map(Object.entries(parsed));
}

async function main() {
  const { apply, yes, overwrite } = parseArgs(process.argv.slice(2));
  const dryRun = !apply;

  const guard = checkRunGuard({ dryRun, yes });
  if (guard) {
    console.error(`✗ ${guard}`);
    process.exit(1);
  }

  const env = readEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) {
    console.error("✗ VITE_SUPABASE_URL not set.");
    process.exit(1);
  }
  if (!serviceKey) {
    console.error("✗ SUPABASE_SERVICE_ROLE_KEY not set.");
    process.exit(1);
  }
  const projectRef = extractProjectRef(supabaseUrl);
  console.log(`Target project: ${projectRef}${projectRef === PRODUCTION_PROJECT_REF ? " (PRODUCTION)" : ""}`);
  console.log(dryRun ? "Mode: DRY RUN — no changes will be made.\n" : `Mode: APPLY${overwrite ? " (OVERWRITE)" : ""} — writing to Supabase.\n`);

  const sourceList = JSON.parse(await fs.readFile(LIVE_FILE, "utf8"));
  const overrides = await loadOverrides();
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: animals, error } = await supabase
    .from("animals")
    .select("id, type, name, retired_at, image_url")
    .limit(5000);
  if (error) {
    console.error("✗ Could not read animals:", error.message);
    process.exit(1);
  }

  const deps = {
    downloadPhoto: async (url) => {
      try {
        const download = await downloadPhoto(fetch, url);
        return await downscalePhoto(download.bytes);
      } finally {
        await sleep(DOWNLOAD_DELAY_MS);
      }
    },
    async uploadPhoto(key, bytes, contentType) {
      const { error: uploadError } = await supabase.storage
        .from("animal-images")
        .upload(key, bytes, { upsert: true, contentType });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("animal-images").getPublicUrl(key);
      return data.publicUrl;
    },
    async setImageUrl(animalId, url) {
      let query = supabase.from("animals").update({ image_url: url }).eq("id", animalId);
      if (!overwrite) query = query.is("image_url", null);
      const { data, error: updateError } = await query.select("id");
      if (updateError) throw updateError;
      if (!data || data.length === 0) {
        throw new Error(`animal ${animalId} was not updated (already has an image or no longer exists)`);
      }
    },
  };

  const plan = await runBackfill({
    sourceList,
    animals: animals ?? [],
    overrides,
    dryRun: true,
    overwrite,
    deps,
  });
  console.log(
    `Planned: ${plan.summary["pending-apply"] ?? 0} to apply, ` +
      `${plan.summary["skipped-already-imaged"] ?? 0} already imaged, ` +
      `${plan.summary.ambiguous ?? 0} ambiguous, ` +
      `${plan.summary["unmatched-live"] ?? 0} unmatched-live, ` +
      `${plan.dbNotListed.length} db-not-listed.`,
  );

  const result = dryRun
    ? plan
    : await runBackfill({ sourceList, animals: animals ?? [], overrides, dryRun: false, overwrite, deps });
  const { manifest, dbNotListed, summary } = result;

  await fs.mkdir(path.dirname(MANIFEST_JSON), { recursive: true });
  await fs.writeFile(MANIFEST_JSON, `${JSON.stringify({ dryRun, summary, manifest, dbNotListed }, null, 2)}\n`, "utf8");
  const csvRows = [
    ...manifest.map((row) => ({ kind: "source", ...row })),
    ...dbNotListed.map((row) => ({
      kind: "db-not-listed",
      sourceId: "",
      type: row.type,
      name: row.name,
      status: "db-not-listed",
      animalId: row.animalId,
      candidates: [],
      image_url: row.image_url,
      error: null,
    })),
  ];
  await fs.writeFile(MANIFEST_CSV, `${toCsv(csvRows)}\n`, "utf8");

  console.log("Summary:", JSON.stringify(summary, null, 2));
  console.log(`\nManifest: ${MANIFEST_JSON}\n         ${MANIFEST_CSV}`);

  const failed = manifest.filter((row) => row.status === "failed");
  if (failed.length > 0) {
    console.error(`\n✗ ${failed.length} animal(s) failed to apply.`);
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("Fatal:", e.message);
    process.exit(1);
  });
}
