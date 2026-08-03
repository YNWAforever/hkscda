import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const BUCKET_NAME = "site-documents";
const READINESS_MESSAGE = "English PDF is required before submission.";
const DEFAULT_CAT_PDF =
  "C:\\Users\\laich\\Downloads\\What you need to know after adopting a cat (Completed).pdf";
const DEFAULT_DOG_PDF =
  "C:\\Users\\laich\\Downloads\\What you need to know after adoption (\u5b8c\u6210\u7248).pdf";

export function buildDraftDefinitions({ catPdf, dogPdf }) {
  return [
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
  ];
}

export function parseImportArgs(args) {
  const parsed = {
    apply: false,
    catPdf: DEFAULT_CAT_PDF,
    dogPdf: DEFAULT_DOG_PDF,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") {
      parsed.apply = true;
      continue;
    }
    if (argument === "--cat-pdf" || argument === "--dog-pdf") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a file path`);
      }
      parsed[argument === "--cat-pdf" ? "catPdf" : "dogPdf"] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

export function inspectPdfBuffer(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error("PDF must not exceed 50 MiB");
  }
  if (bytes.byteLength < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("PDF must begin with %PDF-");
  }
  return {
    bytes,
    byteSize: bytes.byteLength,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function applyDraftDefinitions({
  definitions,
  apply,
  readPdf: readPdfDependency = readFile,
  createAdapter,
}) {
  assertControlledDefinitions(definitions);
  const inspected = await Promise.all(
    definitions.map(async (definition) => {
      let bytes;
      try {
        bytes = await readPdfDependency(definition.localPath);
      } catch (error) {
        throw new Error(`PDF not found or unreadable: ${definition.localPath}`, { cause: error });
      }
      return { definition, inspection: inspectPdfBuffer(bytes) };
    }),
  );

  if (!apply) {
    return inspected.map(({ definition, inspection }) => ({
      mode: "dry-run",
      ...publicSummary(definition, inspection),
      readiness: READINESS_MESSAGE,
    }));
  }
  if (typeof createAdapter !== "function") {
    throw new Error("Apply mode requires an importer adapter");
  }

  const adapter = createAdapter();
  if (typeof adapter.preflight !== "function") {
    throw new Error("Apply mode requires actor preflight");
  }
  await adapter.preflight();

  const results = [];
  for (const { definition, inspection } of inspected) {
    const asset = await findOrCreateAsset(adapter, definition, inspection);
    const release = await findOrCreateDraft(adapter, definition, asset.id);
    results.push({
      mode: "applied",
      ...publicSummary(definition, inspection),
      assetId: asset.id,
      releaseId: release.id,
      readiness: READINESS_MESSAGE,
    });
  }
  return results;
}

function assertControlledDefinitions(definitions) {
  if (!Array.isArray(definitions) || definitions.length !== 2) {
    throw new Error("Importer is restricted to exactly the cat and dog Chinese drafts");
  }
  const signature = definitions
    .map((item) => `${item.topic}:${item.species}:${item.language}:${item.state}`)
    .sort();
  if (
    signature.join("|") !==
    ["post_adoption:cat:zh-HK:draft", "post_adoption:dog:zh-HK:draft"].join("|")
  ) {
    throw new Error("Importer is restricted to exactly the cat and dog Chinese drafts");
  }
}

function publicSummary(definition, inspection) {
  return {
    topic: definition.topic,
    species: definition.species,
    language: definition.language,
    state: "draft",
    localPath: definition.localPath,
    objectPath: definition.objectPath,
    byteSize: inspection.byteSize,
    checksumSha256: inspection.checksumSha256,
  };
}

async function findOrCreateAsset(adapter, definition, inspection) {
  let asset = await adapter.findAsset(definition.objectPath);
  if (asset) {
    assertMatchingAsset(asset, definition, inspection);
    return asset;
  }

  try {
    await adapter.uploadObject({
      bucketName: BUCKET_NAME,
      objectPath: definition.objectPath,
      bytes: inspection.bytes,
      contentType: "application/pdf",
      upsert: false,
    });
  } catch (error) {
    if (!isDuplicateError(error) || typeof adapter.readObject !== "function") throw error;
    const storedInspection = inspectPdfBuffer(
      await adapter.readObject(BUCKET_NAME, definition.objectPath),
    );
    if (storedInspection.checksumSha256 !== inspection.checksumSha256) {
      throw new Error(`Existing storage object does not match ${definition.objectPath}`);
    }
  }

  const input = {
    kind: "adoption_guide",
    title: definition.title,
    language: "zh-HK",
    bucketName: BUCKET_NAME,
    objectPath: definition.objectPath,
    mimeType: "application/pdf",
    byteSize: inspection.byteSize,
    checksumSha256: inspection.checksumSha256,
    isPublished: false,
    sortOrder: definition.species === "cat" ? 0 : 1,
  };
  try {
    asset = await adapter.createAsset(input);
  } catch (error) {
    if (!isDuplicateError(error)) throw error;
    asset = await adapter.findAsset(definition.objectPath);
  }
  if (!asset) throw new Error(`Unable to create or reuse asset ${definition.objectPath}`);
  assertMatchingAsset(asset, definition, inspection);
  return asset;
}

function assertMatchingAsset(asset, definition, inspection) {
  if (
    asset.objectPath !== definition.objectPath ||
    asset.checksumSha256 !== inspection.checksumSha256 ||
    asset.language !== "zh-HK" ||
    asset.kind !== "adoption_guide"
  ) {
    throw new Error(`Existing asset does not match the requested import: ${definition.objectPath}`);
  }
}

async function findOrCreateDraft(adapter, definition, assetId) {
  const releaseId = deterministicUuid(`adoption-guide-draft:${definition.idempotencyKey}`);
  let release = await adapter.findDraft({
    id: releaseId,
    topic: definition.topic,
    species: definition.species,
  });
  if (!release) {
    const input = {
      id: releaseId,
      topic: definition.topic,
      species: definition.species,
      zhHkAssetId: assetId,
      enAssetId: null,
      state: "draft",
    };
    try {
      release = await adapter.createDraft(input);
    } catch (error) {
      if (!isDuplicateError(error)) throw error;
      release = await adapter.findDraft({
        id: releaseId,
        topic: definition.topic,
        species: definition.species,
      });
    }
  }
  if (!release) throw new Error(`Unable to create or reuse ${definition.idempotencyKey}`);
  if (
    release.topic !== definition.topic ||
    release.species !== definition.species ||
    release.state !== "draft" ||
    release.enAssetId !== null ||
    release.zhHkAssetId !== assetId
  ) {
    throw new Error(
      `Existing release does not match the requested import: ${definition.idempotencyKey}`,
    );
  }
  return release;
}

function deterministicUuid(value) {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(
    17,
    20,
  )}-${hex.slice(20, 32)}`;
}

function isDuplicateError(error) {
  if (!error || typeof error !== "object") return false;
  const candidate = error;
  return (
    candidate.code === "23505" ||
    candidate.statusCode === "409" ||
    candidate.status === 409 ||
    /already exists|duplicate|resource exists/i.test(String(candidate.message ?? ""))
  );
}

export async function preflightImportActor({ actorId, findAdminUser }) {
  if (
    typeof actorId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorId)
  ) {
    throw new Error("ADOPTION_GUIDE_IMPORT_ACTOR_ID must be a valid UUID");
  }
  if (typeof findAdminUser !== "function") {
    throw new Error("Actor preflight requires an admin_user lookup");
  }

  const adminUser = await findAdminUser(actorId);
  if (!adminUser || adminUser.id !== actorId) {
    throw new Error(`No admin_user exists for import actor ${actorId}`);
  }
  if (adminUser.status !== "active") {
    throw new Error(`Import actor ${actorId} must be active`);
  }
  if (adminUser.role !== "staff" && adminUser.role !== "admin") {
    throw new Error(`Import actor ${actorId} must have the staff or admin role`);
  }
  return adminUser;
}
function readEnvironment() {
  const loaded = {};
  for (const filename of [".env", ".env.local"]) {
    if (!existsSync(filename)) continue;
    for (const line of readFileSync(filename, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([^#=][^=]*?)\s*=\s*(.*)$/);
      if (match) loaded[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return { ...loaded, ...process.env };
}

function createSupabaseAdapter({ supabase, actorId }) {
  return {
    async preflight() {
      return preflightImportActor({
        actorId,
        findAdminUser: async (id) => {
          const { data, error } = await supabase
            .from("admin_user")
            .select("id,role,status")
            .eq("id", id)
            .maybeSingle();
          if (error) {
            throw new Error("Unable to verify service-role connection and import actor", {
              cause: error,
            });
          }
          return data;
        },
      });
    },
    async findAsset(objectPath) {
      const { data, error } = await supabase
        .from("document_assets")
        .select("id, kind, language, object_path, checksum_sha256")
        .eq("bucket_name", BUCKET_NAME)
        .eq("object_path", objectPath)
        .maybeSingle();
      if (error) throw error;
      return data ? mapAsset(data) : null;
    },
    async uploadObject({ objectPath, bytes, contentType, upsert }) {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(objectPath, bytes, { contentType, upsert });
      if (error) throw error;
    },
    async readObject(bucketName, objectPath) {
      const { data, error } = await supabase.storage.from(bucketName).download(objectPath);
      if (error) throw error;
      return Buffer.from(await data.arrayBuffer());
    },
    async createAsset(input) {
      const { data, error } = await supabase
        .from("document_assets")
        .insert({
          kind: input.kind,
          title: input.title,
          language: input.language,
          bucket_name: input.bucketName,
          object_path: input.objectPath,
          mime_type: input.mimeType,
          byte_size: input.byteSize,
          checksum_sha256: input.checksumSha256,
          is_published: false,
          sort_order: input.sortOrder,
        })
        .select("id, kind, language, object_path, checksum_sha256")
        .single();
      if (error) throw error;
      return mapAsset(data);
    },
    async findDraft({ id, topic, species }) {
      const byId = await supabase
        .from("adoption_guide_releases")
        .select("id, topic, species, zh_hk_asset_id, en_asset_id, state")
        .eq("id", id)
        .maybeSingle();
      if (byId.error) throw byId.error;
      if (byId.data) return mapRelease(byId.data);

      const byKey = await supabase
        .from("adoption_guide_releases")
        .select("id, topic, species, zh_hk_asset_id, en_asset_id, state")
        .eq("topic", topic)
        .eq("species", species)
        .eq("state", "draft")
        .limit(2);
      if (byKey.error) throw byKey.error;
      if ((byKey.data ?? []).length > 1) {
        throw new Error(`Multiple drafts already exist for ${topic}:${species}`);
      }
      return byKey.data?.[0] ? mapRelease(byKey.data[0]) : null;
    },
    async createDraft(input) {
      const { data, error } = await supabase
        .from("adoption_guide_releases")
        .insert({
          id: input.id,
          topic: input.topic,
          species: input.species,
          zh_hk_asset_id: input.zhHkAssetId,
          en_asset_id: null,
          state: "draft",
          created_by: actorId,
          updated_by: actorId,
        })
        .select("id, topic, species, zh_hk_asset_id, en_asset_id, state")
        .single();
      if (error) throw error;
      return mapRelease(data);
    },
  };
}

function mapAsset(row) {
  return {
    id: row.id,
    kind: row.kind,
    language: row.language,
    objectPath: row.object_path,
    checksumSha256: row.checksum_sha256,
  };
}

function mapRelease(row) {
  return {
    id: row.id,
    topic: row.topic,
    species: row.species,
    zhHkAssetId: row.zh_hk_asset_id,
    enAssetId: row.en_asset_id,
    state: row.state,
  };
}

async function main() {
  const args = parseImportArgs(process.argv.slice(2));
  const definitions = buildDraftDefinitions(args);
  let createAdapter;
  if (args.apply) {
    const environment = readEnvironment();
    const url = environment.VITE_SUPABASE_URL || environment.SUPABASE_URL;
    const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
    const actorId = environment.ADOPTION_GUIDE_IMPORT_ACTOR_ID;
    if (!url || !serviceRoleKey || !actorId) {
      throw new Error(
        "Apply mode requires VITE_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, and ADOPTION_GUIDE_IMPORT_ACTOR_ID",
      );
    }
    createAdapter = () =>
      createSupabaseAdapter({
        actorId,
        supabase: createClient(url, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        }),
      });
  }

  const results = await applyDraftDefinitions({
    definitions,
    apply: args.apply,
    createAdapter,
  });
  console.log(args.apply ? "APPLY completed." : "DRY RUN only; no network or database writes.");
  for (const result of results) {
    console.log(
      `${result.species} ${result.language} ${result.state}: ${result.objectPath} sha256=${result.checksumSha256}`,
    );
    if (result.releaseId) console.log(`releaseId=${result.releaseId} assetId=${result.assetId}`);
    console.log(result.readiness);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
