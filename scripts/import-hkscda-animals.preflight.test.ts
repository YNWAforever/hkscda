import { describe, expect, test } from "bun:test";

import { assertAnimalImportReady } from "./import-hkscda-animals.preflight.js";

const animals = [{ sourceUrl: "https://example.test/cat-1", animalType: "cat" }];

function probe(error: { message: string } | null = null) {
  let queries = 0;
  const client = {
    from(table: string) {
      expect(table).toBe("animals");
      queries += 1;
      return {
        select(column: string) {
          expect(column).toBe("source_url");
          return { limit: async () => ({ error }) };
        },
      };
    },
  };
  return { client, getQueries: () => queries };
}

describe("animal import preflight", () => {
  test("rejects a missing source_url column before any import work", async () => {
    const { client } = probe({ message: "column animals.source_url does not exist" });
    await expect(assertAnimalImportReady(client, animals)).rejects.toThrow(
      "Cannot verify the animals.source_url column",
    );
  });

  test("rejects missing or repeated source URLs before touching the database", async () => {
    const missing = probe();
    await expect(assertAnimalImportReady(missing.client, [{ animalType: "cat" }])).rejects.toThrow(
      "sourceUrl",
    );
    expect(missing.getQueries()).toBe(0);

    const duplicate = probe();
    await expect(
      assertAnimalImportReady(duplicate.client, [animals[0], animals[0]]),
    ).rejects.toThrow("Duplicate sourceUrl");
    expect(duplicate.getQueries()).toBe(0);
  });

  test("accepts unique source URLs when the column probe succeeds", async () => {
    const { client, getQueries } = probe();
    await expect(assertAnimalImportReady(client, animals)).resolves.toEqual(animals);
    expect(getQueries()).toBe(1);
  });
});
