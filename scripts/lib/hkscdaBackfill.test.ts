import { describe, expect, test } from "bun:test";

import { photoStorageKey, runBackfill, summarize } from "./hkscdaBackfill.mjs";

const source = (over = {}) => ({
  sourceId: "5309",
  type: "cat",
  name: "肥黑",
  photoPath: "/HKSCDA/a.jpeg",
  ...over,
});
const animal = (over = {}) => ({
  id: "id-1",
  type: "cat",
  name: "肥黑",
  retired_at: null,
  image_url: null,
  ...over,
});

function makeDeps() {
  const calls = { downloads: [] as string[], uploads: [] as string[], updates: [] as string[] };
  return {
    calls,
    deps: {
      downloadPhoto: async (url: string) => {
        calls.downloads.push(url);
        return { bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" };
      },
      uploadPhoto: async (key: string) => {
        calls.uploads.push(key);
        return `https://proj.supabase.co/storage/v1/object/public/animal-images/${key}`;
      },
      setImageUrl: async (id: string) => {
        calls.updates.push(id);
      },
    },
  };
}

describe("photoStorageKey", () => {
  test("builds a deterministic key from the source id and extension", () => {
    expect(photoStorageKey("5309", "jpg")).toBe("hkscda/5309.jpg");
  });
});

describe("runBackfill", () => {
  test("dry-run matches but never downloads, uploads or updates", async () => {
    const { deps, calls } = makeDeps();
    const result = await runBackfill({
      sourceList: [source()],
      animals: [animal()],
      dryRun: true,
      deps,
    });
    expect(result.manifest[0].status).toBe("pending-apply");
    expect(calls.downloads).toEqual([]);
    expect(calls.uploads).toEqual([]);
    expect(calls.updates).toEqual([]);
  });

  test("apply downloads, uploads under a deterministic key, and writes image_url", async () => {
    const { deps, calls } = makeDeps();
    const result = await runBackfill({
      sourceList: [source()],
      animals: [animal()],
      dryRun: false,
      deps,
    });
    expect(calls.downloads).toEqual(["https://hkscda.com/HKSCDA/a.jpeg"]);
    expect(calls.uploads).toEqual(["hkscda/5309.jpg"]);
    expect(calls.updates).toEqual(["id-1"]);
    expect(result.manifest[0].status).toBe("applied");
    expect(result.manifest[0].image_url).toContain("hkscda/5309.jpg");
  });

  test("a download failure is recorded as failed and does not throw", async () => {
    const { deps, calls } = makeDeps();
    deps.downloadPhoto = async () => {
      throw new Error("boom");
    };
    const result = await runBackfill({
      sourceList: [source()],
      animals: [animal()],
      dryRun: false,
      deps,
    });
    expect(result.manifest[0].status).toBe("failed");
    expect(result.manifest[0].error).toBe("boom");
    expect(calls.updates).toEqual([]);
  });

  test("an animal absent from the listing is reported as db-not-listed", async () => {
    const { deps } = makeDeps();
    const result = await runBackfill({
      sourceList: [source()],
      animals: [animal(), animal({ id: "id-2", name: "missing" })],
      dryRun: true,
      deps,
    });
    expect(result.dbNotListed.map((d) => d.animalId)).toEqual(["id-2"]);
  });
});

describe("summarize", () => {
  test("counts statuses and includes db-not-listed", () => {
    const counts = summarize(
      [{ status: "matched" }, { status: "matched" }, { status: "failed" }] as never,
      [{ animalId: "x" }] as never,
    );
    expect(counts).toEqual({ matched: 2, failed: 1, "db-not-listed": 1 });
  });
});
