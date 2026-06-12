/**
 * HKSCDA Animal Importer  —  scripts/import-hkscda-animals.js
 *
 * Reads data/hkscda-animals.json and upserts into the Supabase `animals` table.
 * Photos are uploaded to the `animal-images` Supabase Storage bucket.
 *
 * Requirements:
 *   VITE_SUPABASE_URL=...          (already in .env)
 *   SUPABASE_SERVICE_ROLE_KEY=...  (add to .env — Supabase Dashboard → Settings → API)
 *
 * Run:
 *   npm run import:hkscda
 *   node scripts/import-hkscda-animals.js
 *
 * NOTE — Before first run, add source_url to the animals table via Supabase SQL Editor:
 *   ALTER TABLE animals ADD COLUMN IF NOT EXISTS source_url text;
 *   CREATE UNIQUE INDEX IF NOT EXISTS animals_source_url_idx
 *     ON animals(source_url) WHERE source_url IS NOT NULL;
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const JSON_FILE = path.join("data", "hkscda-animals.json");

// ── Env loading (no dotenv dependency needed) ────────────────────────────────

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

const env = readEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("✗ VITE_SUPABASE_URL not set. Check your .env file.");
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error("✗ SUPABASE_SERVICE_ROLE_KEY not set.");
  console.error("  Get it: Supabase Dashboard → Project Settings → API → service_role");
  console.error("  Add to .env:  SUPABASE_SERVICE_ROLE_KEY=eyJ...");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Field mapping helpers ────────────────────────────────────────────────────

function parseGender(raw) {
  if (!raw) return "female";
  if (/公|male|\bm\b/i.test(raw)) return "male";
  return "female";
}

function parseStatus(raw) {
  if (!raw) return "available";
  if (/已領養|adopted/i.test(raw)) return "adopted";
  if (/暫托|foster/i.test(raw)) return "fostered";
  return "available";
}

function buildDescription(animal) {
  const parts = [];
  if (animal.personality) parts.push(`性格：${animal.personality}`);
  if (animal.healthCondition) parts.push(`健康情況：${animal.healthCondition}`);
  return parts.join("\n") || null;
}

function buildNotes(animal) {
  const parts = [];
  if (animal.suitableAdopter) parts.push(`適合人士：${animal.suitableAdopter}`);
  if (animal.source) parts.push(`來源：${animal.source}`);
  if (animal.chipStatus) parts.push(`晶片：${animal.chipStatus}`);
  if (animal.neuterStatus) parts.push(`絕育：${animal.neuterStatus}`);
  if (animal.remarks) parts.push(`備註：${animal.remarks}`);
  return parts.join("\n") || null;
}

// ── Check if source_url column exists ────────────────────────────────────────

async function checkSourceUrlColumn() {
  const { error } = await supabase.from("animals").select("source_url").limit(1);
  if (error && error.message.toLowerCase().includes("source_url")) {
    console.warn("\n⚠  source_url column not found. Run this SQL in Supabase SQL Editor:\n");
    console.warn("   ALTER TABLE animals ADD COLUMN IF NOT EXISTS source_url text;");
    console.warn("   CREATE UNIQUE INDEX IF NOT EXISTS animals_source_url_idx");
    console.warn("     ON animals(source_url) WHERE source_url IS NOT NULL;\n");
    console.warn("   Continuing without idempotent upsert — duplicates may be created.\n");
    return false;
  }
  return true;
}

// ── Photo upload to Supabase Storage ─────────────────────────────────────────

async function uploadPhoto(localRelPath, storageKey) {
  const localPath = localRelPath.replace(/^\//, "");
  if (!existsSync(localPath)) return null;
  try {
    const fileData = await fs.readFile(localPath);
    const { error } = await supabase.storage
      .from("animal-images")
      .upload(storageKey, fileData, { upsert: true, contentType: "image/jpeg" });
    if (error) throw error;
    const { data } = supabase.storage.from("animal-images").getPublicUrl(storageKey);
    return data?.publicUrl || null;
  } catch (e) {
    console.error(`    ✗ Storage upload failed (${storageKey}): ${e.message}`);
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(JSON_FILE)) {
    console.error(`✗ ${JSON_FILE} not found. Run 'npm run scrape:hkscda' first.`);
    process.exit(1);
  }

  const raw = await fs.readFile(JSON_FILE, "utf8");
  const animals = JSON.parse(raw);
  console.log(`Loaded ${animals.length} animal(s) from ${JSON_FILE}\n`);

  const hasSourceUrl = await checkSourceUrlColumn();

  let created = 0,
    updated = 0,
    skipped = 0,
    errors = 0;

  for (let i = 0; i < animals.length; i++) {
    const animal = animals[i];
    const label = (animal.name || animal.nameEn || `#${i + 1}`).slice(0, 20).padEnd(22);
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${animals.length}] ${label}`);

    if (!animal.animalType || !["cat", "dog"].includes(animal.animalType)) {
      console.log(`⚠  Skipped — unknown animalType (${animal.animalType ?? "null"})`);
      skipped++;
      continue;
    }

    try {
      // Resolve image URL: upload local file to Storage if available, else use external URL
      let image_url = animal.mainPhotoUrl || null;
      if (animal.localPhotoPaths && animal.localPhotoPaths.length > 0) {
        const storageKey = `hkscda-${animal.animalType}-${i}.jpg`;
        const uploaded = await uploadPhoto(animal.localPhotoPaths[0], storageKey);
        if (uploaded) image_url = uploaded;
      }

      const record = {
        type: animal.animalType, // 'cat' | 'dog'
        name: animal.name || animal.nameEn || "未知",
        name_en: animal.nameEn || null,
        gender: parseGender(animal.gender), // 'male' | 'female'
        age: animal.age || "不詳",
        description: buildDescription(animal), // 性格 + 健康情況
        notes: buildNotes(animal), // 來源, 晶片, 絕育, 備註, etc.
        status: parseStatus(animal.adoptionStatus), // 'available' | 'adopted' | 'fostered'
        image_url,
        updated_at: new Date().toISOString(),
      };
      if (hasSourceUrl) record.source_url = animal.sourceUrl || null;

      // Look for existing record by source_url (idempotent upsert)
      let existingId = null;
      if (hasSourceUrl && animal.sourceUrl) {
        const { data: existing } = await supabase
          .from("animals")
          .select("id")
          .eq("source_url", animal.sourceUrl)
          .maybeSingle();
        existingId = existing?.id ?? null;
      }

      if (existingId) {
        const { error } = await supabase.from("animals").update(record).eq("id", existingId);
        if (error) throw error;
        console.log("↑ Updated");
        updated++;
      } else {
        const { error } = await supabase.from("animals").insert(record);
        if (error) throw error;
        console.log("+ Created");
        created++;
      }
    } catch (e) {
      console.log(`✗ ${e.message}`);
      errors++;
    }
  }

  console.log("\n" + "═".repeat(50));
  console.log("Import complete.");
  console.log(`  Created : ${created}`);
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Errors  : ${errors}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
