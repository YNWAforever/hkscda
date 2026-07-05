import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260705120000_story_promotion_center.sql"),
  "utf8",
);

describe("story promotion center migration", () => {
  test("creates every publishing table with RLS enabled", () => {
    for (const table of [
      "content_item",
      "content_link",
      "rescue_story_profile",
      "story_update",
      "content_media",
      "social_copy_variant",
      "recipient_notification_draft",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  test("keeps direct table access private and staff-gated", () => {
    expect(migration).toContain("revoke all on public.rescue_story_profile from anon, authenticated");
    expect(migration).toContain(
      "revoke all on public.recipient_notification_draft from anon, authenticated",
    );
    expect(migration).toContain("private.has_admin_role(array['staff', 'admin'])");
    expect(migration).not.toContain("grant select on public.rescue_story_profile to anon");
    expect(migration).not.toContain("grant select on public.recipient_notification_draft to anon");
  });

  test("stores separate public-safe and internal rescue locations", () => {
    expect(migration).toContain("public_map_label text");
    expect(migration).toContain("public_lat numeric(9, 6)");
    expect(migration).toContain("public_lng numeric(9, 6)");
    expect(migration).toContain("internal_address text");
    expect(migration).toContain("internal_location_notes text");
  });
});
