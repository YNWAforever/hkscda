import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";
const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20260905163559_content_bounded_authoring_reads.sql",
    import.meta.url,
  ),
  "utf8",
);
test("admin projection filters profiles before pagination and bounds history", () => {
  expect(sql).toContain("exists(select 1 from public.rescue_story_profile");
  expect(sql).toContain("limit 1");
  expect(sql).toContain("limit 21");
  expect(sql).toContain("order by item.updated_at desc,item.id");
  expect(sql).toContain("from public,anon,authenticated");
});
