import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";
const lifecycle = readFileSync(
  new URL(
    "../../../supabase/migrations/20260905150012_content_revision_lifecycle.sql",
    import.meta.url,
  ),
  "utf8",
);
const media = readFileSync(
  new URL(
    "../../../supabase/migrations/20260905155426_content_private_media_sessions.sql",
    import.meta.url,
  ),
  "utf8",
);
test("preparation and publication share validation before public asset records", () => {
  const prepare = media
    .split("create or replace function public.prepare_content_public_assets")[1]
    .split("create or replace function public.mark_content_public_asset_ready")[0];
  expect(lifecycle).toContain(
    "perform private.validate_content_publication_snapshot(revision.public_snapshot)",
  );
  expect(prepare).toContain(
    "perform private.validate_content_publication_snapshot(revision.public_snapshot)",
  );
  expect(prepare.indexOf("perform private.validate_content_publication_snapshot")).toBeLessThan(
    prepare.indexOf("insert into public.content_public_asset"),
  );
  expect(prepare).toContain("from public.content_publish_request");
  expect(prepare).toContain("hashtextextended(p_idempotency_key,0)");
});

const afterCommit = readFileSync(
  new URL(
    "../../../supabase/migrations/20260926190000_content_publication_media_after_commit.sql",
    import.meta.url,
  ),
  "utf8",
);

test("committed publication can omit pending media and replay its copy intent", () => {
  expect(afterCommit).toContain("asset.media_id=(media->>'id')::uuid");
  expect(afterCommit).toContain("asset.revision_id=new.published_revision_id");
  expect(afterCommit).not.toContain("asset.media_id=(media->>'id')::uuid and asset.ready");
  expect(afterCommit).toContain("return coalesce((select jsonb_agg(to_jsonb(asset)");
  expect(afterCommit).toContain("claim_due_content_public_assets");
});
