/**
 * Pure backfill orchestration. All side effects (download, upload, DB write)
 * arrive as injected `deps`, so this module is testable without a network or
 * a database. The CLI in scripts/apply-hkscda-photos.mjs supplies real deps.
 */

import { collectDbNotListed, matchSourceToAnimals, STATUS } from "./hkscdaMapping.mjs";
import { extensionForContentType, toAbsolutePhotoUrl } from "./hkscdaListing.mjs";

export function photoStorageKey(sourceId, ext) {
  return `hkscda/${sourceId}.${ext}`;
}

export function summarize(manifest, dbNotListed) {
  const counts = {};
  for (const row of manifest) counts[row.status] = (counts[row.status] ?? 0) + 1;
  counts["db-not-listed"] = dbNotListed.length;
  return counts;
}

export async function runBackfill({ sourceList, animals, overrides = new Map(), dryRun = true, deps }) {
  const results = matchSourceToAnimals(sourceList, animals, overrides);
  const manifest = [];

  for (const result of results) {
    const base = {
      sourceId: result.source.sourceId,
      type: result.source.type,
      name: result.source.name,
      animalId: result.animalId ?? null,
      candidates: result.candidates ?? [],
      image_url: null,
      error: null,
    };

    if (result.status === STATUS.MATCHED || result.status === STATUS.OVERRIDE) {
      if (dryRun) {
        manifest.push({ ...base, status: "pending-apply" });
        continue;
      }
      try {
        const absoluteUrl = toAbsolutePhotoUrl(result.source.photoPath);
        if (!absoluteUrl) throw new Error("source has no photo path");
        const download = await deps.downloadPhoto(absoluteUrl);
        const ext = extensionForContentType(download.contentType, absoluteUrl);
        const key = photoStorageKey(result.source.sourceId, ext);
        const publicUrl = await deps.uploadPhoto(key, download.bytes, download.contentType);
        await deps.setImageUrl(result.animalId, publicUrl);
        const appliedStatus = result.status === STATUS.OVERRIDE ? STATUS.OVERRIDE : "applied";
        manifest.push({ ...base, status: appliedStatus, image_url: publicUrl });
      } catch (error) {
        manifest.push({ ...base, status: "failed", error: error.message });
      }
    } else if (result.status === STATUS.UNMATCHED) {
      manifest.push({ ...base, status: "unmatched-live" });
    } else {
      manifest.push({ ...base, status: result.status });
    }
  }

  const dbNotListed = collectDbNotListed(animals, results);
  return { manifest, dbNotListed, summary: summarize(manifest, dbNotListed) };
}
