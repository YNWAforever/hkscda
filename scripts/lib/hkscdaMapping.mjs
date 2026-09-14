/**
 * Pure source->animal matching for the hkscda.com photo backfill.
 * No network, no Supabase import — data in, data out.
 */

export const STATUS = Object.freeze({
  OVERRIDE: "override",
  MATCHED: "matched",
  AMBIGUOUS: "ambiguous",
  UNMATCHED: "unmatched",
  SKIPPED_ALREADY_IMAGED: "skipped-already-imaged",
});

export function normalizeName(name) {
  if (typeof name !== "string") return "";
  return name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function animalKey(type, name) {
  return `${type}\u0000${normalizeName(name)}`;
}

function hasImage(animal) {
  return typeof animal.image_url === "string" && animal.image_url.trim().length > 0;
}

export function matchSourceToAnimals(sourceList, animals, overrides = new Map(), options = {}) {
  const { includeAlreadyImaged = false } = options;
  const active = animals.filter((a) => !a.retired_at);
  const byKey = new Map();
  for (const a of active) {
    const key = animalKey(a.type, a.name);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(a);
    else byKey.set(key, [a]);
  }

  const results = [];
  for (const source of sourceList) {
    const overrideId = overrides.get(source.sourceId);
    if (overrideId) {
      const target = active.find((a) => a.id === overrideId);
      if (!target) {
        results.push({ source, status: STATUS.UNMATCHED, reason: "override-missing" });
      } else if (hasImage(target) && !includeAlreadyImaged) {
        results.push({ source, status: STATUS.SKIPPED_ALREADY_IMAGED, animalId: target.id });
      } else {
        results.push({ source, status: STATUS.OVERRIDE, animalId: target.id });
      }
      continue;
    }

    const candidates = byKey.get(animalKey(source.type, source.name)) ?? [];
    if (candidates.length === 0) {
      results.push({ source, status: STATUS.UNMATCHED });
    } else if (candidates.length > 1) {
      results.push({ source, status: STATUS.AMBIGUOUS, candidates: candidates.map((c) => c.id) });
    } else {
      const target = candidates[0];
      results.push({
        source,
        status: hasImage(target) && !includeAlreadyImaged ? STATUS.SKIPPED_ALREADY_IMAGED : STATUS.MATCHED,
        animalId: target.id,
      });
    }
  }
  return results;
}

export function collectDbNotListed(animals, results) {
  const referenced = new Set();
  for (const result of results) {
    if (result.animalId) referenced.add(result.animalId);
    for (const id of result.candidates ?? []) referenced.add(id);
  }
  return animals
    .filter((a) => !a.retired_at && !referenced.has(a.id))
    .map((a) => ({ animalId: a.id, type: a.type, name: a.name, image_url: a.image_url ?? null }));
}
