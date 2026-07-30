import { describe, expect, test } from "bun:test";

import {
  applyDraftDefinitions,
  buildDraftDefinitions,
  inspectPdfBuffer,
  parseImportArgs,
  preflightImportActor,
} from "./import-adoption-guide-drafts.mjs";

const catPdf =
  "C:\\Users\\laich\\Downloads\\What you need to know after adopting a cat (Completed).pdf";
const dogPdf =
  "C:\\Users\\laich\\Downloads\\What you need to know after adoption (\u5b8c\u6210\u7248).pdf";

describe("controlled adoption guide draft importer", () => {
  test("classifies exactly the supplied PDFs as separate Chinese drafts", () => {
    expect(buildDraftDefinitions({ catPdf, dogPdf })).toEqual([
      {
        topic: "post_adoption",
        species: "cat",
        language: "zh-HK",
        title: "What you need to know after adopting a cat",
        localPath: catPdf,
        objectPath: "adoption-guides/post-adoption/cat/zh-HK.pdf",
        idempotencyKey: "post_adoption:cat",
        state: "draft",
      },
      {
        topic: "post_adoption",
        species: "dog",
        language: "zh-HK",
        title: "What you need to know after adoption",
        localPath: dogPdf,
        objectPath: "adoption-guides/post-adoption/dog/zh-HK.pdf",
        idempotencyKey: "post_adoption:dog",
        state: "draft",
      },
    ]);
  });

  test("defaults to dry-run and requires explicit apply with both PDF paths", () => {
    expect(parseImportArgs([])).toEqual({ apply: false, catPdf, dogPdf });
    expect(parseImportArgs([]).dogPdf).toEndWith(
      "What you need to know after adoption (\u5b8c\u6210\u7248).pdf",
    );
    expect(parseImportArgs(["--cat-pdf", catPdf, "--dog-pdf", dogPdf])).toEqual({
      apply: false,
      catPdf,
      dogPdf,
    });
    expect(parseImportArgs(["--apply", "--cat-pdf", catPdf, "--dog-pdf", dogPdf]).apply).toBe(true);

    expect(() => parseImportArgs(["--cat-pdf", catPdf, "--dog-pdf", dogPdf, "--unknown"])).toThrow(
      "Unknown argument",
    );
  });

  test("validates the PDF signature and size while calculating SHA-256", () => {
    const inspected = inspectPdfBuffer(Buffer.from("%PDF-1.7\nsafe"));
    expect(inspected.byteSize).toBe(13);
    expect(inspected.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => inspectPdfBuffer(Buffer.from("not-pdf"))).toThrow("must begin with %PDF-");
    expect(() => inspectPdfBuffer(Buffer.alloc(50 * 1024 * 1024 + 1))).toThrow(
      "must not exceed 50 MiB",
    );
  });

  test("dry-run inspects both files without creating clients or writing", async () => {
    const definitions = buildDraftDefinitions({ catPdf, dogPdf });
    let writes = 0;
    const result = await applyDraftDefinitions({
      definitions,
      apply: false,
      readPdf: async () => Buffer.from("%PDF-1.7\nsafe"),
      createAdapter: () => {
        writes += 1;
        throw new Error("dry-run must not create an adapter");
      },
    });

    expect(result.map((item) => item.mode)).toEqual(["dry-run", "dry-run"]);
    expect(writes).toBe(0);
  });

  test("reuses matching assets and drafts, rejects mismatches, and never submits or publishes", async () => {
    const definitions = buildDraftDefinitions({ catPdf, dogPdf });
    const checksumSha256 = inspectPdfBuffer(Buffer.from("%PDF-1.7\nsafe")).checksumSha256;
    const events: Array<{ action: string; input?: unknown }> = [];
    const assets = new Map(
      definitions.map((definition) => [
        definition.objectPath,
        {
          id: `asset-${definition.species}`,
          kind: "adoption_guide",
          language: "zh-HK",
          objectPath: definition.objectPath,
          checksumSha256,
        },
      ]),
    );

    const result = await applyDraftDefinitions({
      definitions,
      apply: true,
      readPdf: async () => Buffer.from("%PDF-1.7\nsafe"),
      createAdapter: () => ({
        preflight: async () => undefined,
        findAsset: async (objectPath: string) => assets.get(objectPath),
        uploadObject: async (input: unknown) => events.push({ action: "upload", input }),
        createAsset: async (input: unknown) => {
          events.push({ action: "create-asset", input });
          throw new Error("not reached");
        },
        findDraft: async ({ species }: { species: "cat" | "dog" }) => ({
          id: `release-${species}`,
          topic: "post_adoption",
          species,
          zhHkAssetId: `asset-${species}`,
          enAssetId: null,
          state: "draft",
        }),
        createDraft: async (input: unknown) => {
          events.push({ action: "create-draft", input });
          throw new Error("not reached");
        },
      }),
    });

    expect(
      result.map(({ assetId, releaseId, readiness }) => ({ assetId, releaseId, readiness })),
    ).toEqual([
      {
        assetId: "asset-cat",
        releaseId: "release-cat",
        readiness: "English PDF is required before submission.",
      },
      {
        assetId: "asset-dog",
        releaseId: "release-dog",
        readiness: "English PDF is required before submission.",
      },
    ]);
    expect(events).toEqual([]);

    await expect(
      applyDraftDefinitions({
        definitions,
        apply: true,
        readPdf: async () => Buffer.from("%PDF-1.7\nsafe"),
        createAdapter: () => ({
          preflight: async () => undefined,
          findAsset: async (objectPath: string) => ({ ...assets.get(objectPath), language: "en" }),
          uploadObject: async () => undefined,
          createAsset: async () => assets.values().next().value,
          findDraft: async () => null,
          createDraft: async () => null,
        }),
      }),
    ).rejects.toThrow("does not match the requested import");
  });
  test("creates private assets and deterministic draft-only releases with storage upsert disabled", async () => {
    const definitions = buildDraftDefinitions({ catPdf, dogPdf });
    const events: Array<{ action: string; input: Record<string, unknown> }> = [];
    const result = await applyDraftDefinitions({
      definitions,
      apply: true,
      readPdf: async () => Buffer.from("%PDF-1.7\nsafe"),
      createAdapter: () => ({
        preflight: async () => undefined,
        findAsset: async () => null,
        uploadObject: async (input: Record<string, unknown>) =>
          events.push({ action: "upload", input }),
        createAsset: async (input: Record<string, unknown>) => {
          events.push({ action: "create-asset", input });
          return {
            id: `asset-${input.objectPath?.toString().includes("/cat/") ? "cat" : "dog"}`,
            kind: input.kind,
            language: input.language,
            objectPath: input.objectPath,
            checksumSha256: input.checksumSha256,
          };
        },
        findDraft: async () => null,
        createDraft: async (input: Record<string, unknown>) => {
          events.push({ action: "create-draft", input });
          return input;
        },
      }),
    });

    expect(events.filter((event) => event.action === "upload")).toEqual([
      expect.objectContaining({
        input: expect.objectContaining({ bucketName: "site-documents", upsert: false }),
      }),
      expect.objectContaining({
        input: expect.objectContaining({ bucketName: "site-documents", upsert: false }),
      }),
    ]);
    expect(events.filter((event) => event.action === "create-asset")).toEqual([
      expect.objectContaining({
        input: expect.objectContaining({
          kind: "adoption_guide",
          language: "zh-HK",
          isPublished: false,
        }),
      }),
      expect.objectContaining({
        input: expect.objectContaining({
          kind: "adoption_guide",
          language: "zh-HK",
          isPublished: false,
        }),
      }),
    ]);
    expect(
      events.filter((event) => event.action === "create-draft").map((event) => event.input),
    ).toEqual([
      expect.objectContaining({
        topic: "post_adoption",
        species: "cat",
        enAssetId: null,
        state: "draft",
      }),
      expect.objectContaining({
        topic: "post_adoption",
        species: "dog",
        enAssetId: null,
        state: "draft",
      }),
    ]);
    expect(result.map((item) => item.state)).toEqual(["draft", "draft"]);
  });

  test("recovers safely from matching storage and row duplicates", async () => {
    const definitions = buildDraftDefinitions({ catPdf, dogPdf });
    const checksumSha256 = inspectPdfBuffer(Buffer.from("%PDF-1.7\nsafe")).checksumSha256;
    const assetLookups = new Map<string, number>();
    const draftLookups = new Map<string, number>();

    const result = await applyDraftDefinitions({
      definitions,
      apply: true,
      readPdf: async () => Buffer.from("%PDF-1.7\nsafe"),
      createAdapter: () => ({
        preflight: async () => undefined,
        findAsset: async (objectPath: string) => {
          const count = (assetLookups.get(objectPath) ?? 0) + 1;
          assetLookups.set(objectPath, count);
          if (count === 1) return null;
          const species = objectPath.includes("/cat/") ? "cat" : "dog";
          return {
            id: `asset-${species}`,
            kind: "adoption_guide",
            language: "zh-HK",
            objectPath,
            checksumSha256,
          };
        },
        uploadObject: async () => {
          throw { status: 409, message: "resource already exists" };
        },
        readObject: async () => Buffer.from("%PDF-1.7\nsafe"),
        createAsset: async () => {
          throw { code: "23505", message: "duplicate object_path" };
        },
        findDraft: async ({ species }: { species: "cat" | "dog" }) => {
          const count = (draftLookups.get(species) ?? 0) + 1;
          draftLookups.set(species, count);
          return count === 1
            ? null
            : {
                id: `release-${species}`,
                topic: "post_adoption",
                species,
                zhHkAssetId: `asset-${species}`,
                enAssetId: null,
                state: "draft",
              };
        },
        createDraft: async () => {
          throw { code: "23505", message: "duplicate release id" };
        },
      }),
    });

    expect(result.map(({ assetId, releaseId }) => ({ assetId, releaseId }))).toEqual([
      { assetId: "asset-cat", releaseId: "release-cat" },
      { assetId: "asset-dog", releaseId: "release-dog" },
    ]);
  });

  test.each([
    ["malformed actor UUID", "not-a-uuid", { id: "not-a-uuid", role: "admin", status: "active" }],
    ["missing admin_user", "11111111-1111-4111-8111-111111111111", null],
    [
      "disallowed role",
      "11111111-1111-4111-8111-111111111111",
      { id: "11111111-1111-4111-8111-111111111111", role: "treasurer", status: "active" },
    ],
    [
      "inactive admin",
      "11111111-1111-4111-8111-111111111111",
      { id: "11111111-1111-4111-8111-111111111111", role: "staff", status: "disabled" },
    ],
  ])("rejects %s before any storage or row writes", async (_label, actorId, adminUser) => {
    const definitions = buildDraftDefinitions({ catPdf, dogPdf });
    const events: string[] = [];

    await expect(
      applyDraftDefinitions({
        definitions,
        apply: true,
        readPdf: async () => Buffer.from("%PDF-1.7\nsafe"),
        createAdapter: () => ({
          preflight: () =>
            preflightImportActor({
              actorId,
              findAdminUser: async () => adminUser,
            }),
          findAsset: async () => {
            events.push("find-asset");
            return null;
          },
          uploadObject: async () => events.push("upload"),
          createAsset: async () => events.push("create-asset"),
          findDraft: async () => {
            events.push("find-draft");
            return null;
          },
          createDraft: async () => events.push("create-draft"),
        }),
      }),
    ).rejects.toThrow();

    expect(events).toEqual([]);
  });

  test("actor preflight accepts only an active staff or admin row", async () => {
    const actorId = "11111111-1111-4111-8111-111111111111";
    await expect(
      preflightImportActor({
        actorId,
        findAdminUser: async () => ({ id: actorId, role: "staff", status: "active" }),
      }),
    ).resolves.toEqual({ id: actorId, role: "staff", status: "active" });
  });

  test("rejects a duplicate storage object whose checksum differs", async () => {
    const definitions = buildDraftDefinitions({ catPdf, dogPdf });
    let rowWrites = 0;

    await expect(
      applyDraftDefinitions({
        definitions,
        apply: true,
        readPdf: async () => Buffer.from("%PDF-1.7\nrequested"),
        createAdapter: () => ({
          preflight: async () => undefined,
          findAsset: async () => null,
          uploadObject: async () => {
            throw { status: 409, message: "resource already exists" };
          },
          readObject: async () => Buffer.from("%PDF-1.7\ndifferent"),
          createAsset: async () => {
            rowWrites += 1;
            return null;
          },
          findDraft: async () => null,
          createDraft: async () => null,
        }),
      }),
    ).rejects.toThrow("Existing storage object does not match");

    expect(rowWrites).toBe(0);
  });

  test("rejects an existing draft whose state or asset differs", async () => {
    const definitions = buildDraftDefinitions({ catPdf, dogPdf });
    const checksumSha256 = inspectPdfBuffer(Buffer.from("%PDF-1.7\nsafe")).checksumSha256;

    await expect(
      applyDraftDefinitions({
        definitions,
        apply: true,
        readPdf: async () => Buffer.from("%PDF-1.7\nsafe"),
        createAdapter: () => ({
          preflight: async () => undefined,
          findAsset: async (objectPath: string) => ({
            id: "asset-cat",
            kind: "adoption_guide",
            language: "zh-HK",
            objectPath,
            checksumSha256,
          }),
          uploadObject: async () => undefined,
          createAsset: async () => null,
          findDraft: async () => ({
            id: "release-cat",
            topic: "post_adoption",
            species: "cat",
            zhHkAssetId: "other-asset",
            enAssetId: null,
            state: "submitted",
          }),
          createDraft: async () => null,
        }),
      }),
    ).rejects.toThrow("Existing release does not match");
  });
});
