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
