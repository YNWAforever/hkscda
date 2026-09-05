import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20260905150012_content_revision_lifecycle.sql",
    import.meta.url,
  ),
  "utf8",
);
const publish = sql
  .split("create or replace function public.publish_content_revision")[1]
  .split("create or replace function public.restore_content_revision")[0];
const validation = sql
  .split("create or replace function private.validate_content_publication_snapshot")[1]
  .split("create or replace function public.publish_content_revision")[0];
const restore = sql
  .split("create or replace function public.restore_content_revision")[1]
  .split("-- Backfill")[0];
describe("lifecycle SQL source safeguards (not database acceptance)", () => {
  test("avoids ambiguous publication timestamp assignment", () => {
    expect(publish).not.toMatch(/published_at\s*=\s*published_at/);
  });
  test("recognizes JSON-null profiles in publication and restore", () => {
    expect(validation).toContain("jsonb_typeof(p_snapshot->'profile')");
    expect(restore).toContain("jsonb_typeof(revision.authoring_snapshot->'profile')");
  });
  test("preserves operational update parents during restore", () => {
    expect(restore).not.toMatch(/delete from public.story_update/);
    expect(restore).toContain("on conflict (id) do update");
  });
  test("never rewrites a saved public snapshot on publication", () => {
    expect(publish).not.toMatch(/public_snapshot\s*=/);
  });
  test("backfill preserves original publication time", () => {
    expect(sql).toContain("'legacy_backfill',actor_id,item.published_at");
  });
  test("requires the cover to exist in the filtered public media", () => {
    expect(validation).toContain("jsonb_array_elements(p_snapshot->'media')");
  });
});

test("selected snapshot publication retains required text and map validation", () => {
  for (const field of [
    "title",
    "slug",
    "summary",
    "rescue_region",
    "public_map_label",
    "public_lat",
    "public_lng",
  ]) {
    expect(validation).toContain(`->>'${field}'`);
  }
  expect(validation).toContain("show_on_map");
  expect(validation).toContain("btrim");
});
test("media attachment requires an existing active same-content public update", () => {
  const mediaMutation = sql
    .split("elsif p_operation = 'create_media' then")[1]
    .split("insert into public.content_media")[0];
  expect(mediaMutation).toContain("not exists");
  expect(mediaMutation).toContain("content_item_id=p_content_id");
  expect(mediaMutation).toContain("is_authoring_active");
  expect(mediaMutation).toContain("visibility='public'");
});

test("published snapshot slugs remain unique independently of editable draft slugs", () => {
  expect(sql).toContain("on public.content_item(published_slug) where status='published'");
  expect(publish).toContain("published_slug=revision.public_snapshot->'content'->>'slug'");
  expect(sql).toContain("published_slug=revision.public_snapshot->'content'->>'slug'");
});
