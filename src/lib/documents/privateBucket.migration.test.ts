import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AUDIT R4 practice gap (2026-11-09 audit, "Not filed as bugs"): `site-documents` was a
 * public Storage bucket, so an uploaded but unpublished PDF was readable by anyone with its
 * random-UUID object path. The fix is a private bucket plus one controlled public reader:
 * a page links `/api/documents/<asset id>`, that route asks
 * `public.read_public_document_asset` whether the asset is published *and* referenced by a
 * published annual report, document slot or knowledge post, then redirects to a short-lived
 * signed URL. This test pins the migration and guards the wiring so no reader can slip back
 * to a public Storage URL.
 */
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const FILE = "20261109104000_private_site_documents_bucket.sql";
const SQL = readFileSync(join(MIGRATIONS, FILE), "utf8");

/** The latest merged migration before this batch. A new migration must sort after it. */
const PREVIOUS_LATEST_VERSION = "20261109103000";

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
// Strip line comments before substring checks: the header explains the fix without being it.
const statementText = squash(SQL.replace(/--[^\n]*/g, " "));

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("private site-documents bucket migration", () => {
  test("the bucket is switched to private by id", () => {
    expect(statementText).toContain("update storage.buckets");
    expect(statementText).toContain("set public = false");
    expect(statementText).toContain("where id = 'site-documents';");
  });

  test("one definer RPC decides eligibility with a pinned empty search_path", () => {
    expect(statementText).toContain(
      "create or replace function public.read_public_document_asset(p_asset_id uuid)",
    );
    expect(statementText).toContain("returns jsonb");
    expect(statementText).toContain("security definer");
    expect(statementText).toContain("set search_path = ''");
  });

  test("eligibility needs a published asset and a published reference of every kind", () => {
    expect(statementText).toContain("asset.is_published");
    for (const reference of [
      "from public.site_document_slots slot",
      "from public.knowledge_posts post",
      "from public.annual_reports report",
    ]) {
      expect(statementText).toContain(reference);
    }
    // Every reference branch must test the reference's own publication flag.
    expect((statementText.match(/is_published/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(statementText).not.toMatch(/\bor\s+true\b/i);
  });

  test("the bucket and asset guards are re-applied inside the RPC", () => {
    for (const guard of [
      "asset.bucket_name = 'site-documents'",
      "asset.mime_type = 'application/pdf'",
      "position('/' in asset.object_path) <> 1",
      "position('..' in asset.object_path) = 0",
    ]) {
      expect(statementText).toContain(guard);
    }
  });

  test("only service_role may execute the RPC", () => {
    expect(statementText).toContain(
      "revoke all on function public.read_public_document_asset(uuid) from public, anon, authenticated;",
    );
    expect(statementText).toContain(
      "grant execute on function public.read_public_document_asset(uuid) to service_role;",
    );
    expect(statementText).not.toMatch(/grant execute[^;]*to[^;]*(anon|authenticated)/i);
  });

  test("no table row is read into the migration or rewritten", () => {
    expect(statementText).not.toMatch(/\bdelete from public\./i);
    expect(statementText).not.toMatch(/\binsert into public\./i);
    expect(statementText).not.toMatch(/\bupdate public\./i);
    expect(statementText).not.toMatch(/\btruncate\b/i);
  });

  test("the migration version sorts after the latest merged migration and stays unique", () => {
    expect(FILE.slice(0, 14)).toBe("20261109104000");
    expect(FILE.slice(0, 14) > PREVIOUS_LATEST_VERSION).toBe(true);
    const versions = readdirSync(MIGRATIONS)
      .filter((entry) => /^\d+_.+\.sql$/.test(entry))
      .map((entry) => entry.split("_")[0]);
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe("public document link wiring", () => {
  const readers = [
    "src/lib/documents/repository.server.ts",
    "src/lib/knowledge/repository.server.ts",
    "src/lib/adoptionGuideReleases/repository.server.ts",
  ];

  test("every reader builds the controlled route, never a public Storage URL", () => {
    for (const path of readers) {
      const text = source(path);
      expect(text, path).toContain("publicDocumentDownloadPath");
      expect(text, path).not.toContain("getPublicUrl");
    }
  });

  test("the route addresses one asset id and redirects to a short-lived signed URL", () => {
    const routePath = join(process.cwd(), "src", "routes", "api", "documents", "$assetId.ts");
    expect(existsSync(routePath)).toBe(true);
    const route = source("src/routes/api/documents/$assetId.ts");
    expect(route).toContain('createFileRoute("/api/documents/$assetId")');
    expect(route).toContain('client.rpc("read_public_document_asset"');
    expect(route).toContain("createSignedUrl(");
    expect(route).toContain("PUBLIC_DOCUMENT_SIGNED_URL_TTL_SECONDS");

    const helper = source("src/lib/documents/downloadPath.ts");
    expect(helper).toContain('PUBLIC_DOCUMENT_PATH_PREFIX = "/api/documents"');
    const handler = source("src/lib/documents/download.server.ts");
    expect(handler).toContain("status: 302");
    expect(handler).toContain("location: signedUrl");
    expect(handler).toContain('"cache-control": "no-store"');
  });

  test("the route has focused DI tests for eligibility and URL minting", () => {
    expect(existsSync(join(process.cwd(), "src/routes/api/documents/$assetId.test.ts"))).toBe(true);
  });
});
