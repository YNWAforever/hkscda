/**
 * Validate the full input and its idempotency key before the importer can
 * upload a photo or write a row.
 */
export async function assertAnimalImportReady(client, animals) {
  if (!Array.isArray(animals)) throw new Error("Animal import must be an array");

  const sourceUrls = new Set();
  const normalized = animals.map((animal, index) => {
    const sourceUrl = animal?.sourceUrl;
    if (typeof sourceUrl !== "string" || !sourceUrl.trim()) {
      throw new Error(`Animal ${index + 1} is missing sourceUrl`);
    }
    const trimmed = sourceUrl.trim();
    if (sourceUrls.has(trimmed)) {
      throw new Error(`Duplicate sourceUrl in animal import: ${trimmed}`);
    }
    sourceUrls.add(trimmed);
    return { ...animal, sourceUrl: trimmed };
  });

  const { error } = await client.from("animals").select("source_url").limit(1);
  if (error) {
    throw new Error("Cannot verify the animals.source_url column; refusing to import");
  }
  return normalized;
}
