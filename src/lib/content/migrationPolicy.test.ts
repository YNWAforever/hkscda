import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260705120000_story_promotion_center.sql"),
  "utf8",
);

const publishingTables = [
  { name: "content_item", policy: "staff can manage content items" },
  { name: "content_link", policy: "staff can manage content links" },
  { name: "rescue_story_profile", policy: "staff can manage rescue story profiles" },
  { name: "story_update", policy: "staff can manage story updates" },
  { name: "content_media", policy: "staff can manage content media" },
  { name: "social_copy_variant", policy: "staff can manage social copy variants" },
  {
    name: "recipient_notification_draft",
    policy: "staff can manage recipient notification drafts",
  },
] as const;

describe("story promotion center migration", () => {
  test("creates every publishing table with RLS enabled", () => {
    for (const table of publishingTables) {
      expect(migration).toContain(`create table if not exists public.${table.name}`);
      expect(migration).toContain(`alter table public.${table.name} enable row level security`);
    }
  });

  test("keeps direct table access private and staff-gated for every table", () => {
    for (const table of publishingTables) {
      expect(migration).toContain(
        `grant select, insert, update, delete on public.${table.name} to service_role`,
      );
      expect(migration).toContain(`revoke all on public.${table.name} from anon, authenticated`);
      expect(migration).toContain(
        `drop policy if exists "${table.policy}" on public.${table.name}`,
      );
      expect(migration).toContain(`create policy "${table.policy}"`);
    }

    const staffGate = "private.has_admin_role(array['staff', 'admin'])";
    expect(
      migration.match(/using \(private\.has_admin_role\(array\['staff', 'admin'\]\)\)/g),
    ).toHaveLength(publishingTables.length);
    expect(
      migration.match(/with check \(private\.has_admin_role\(array\['staff', 'admin'\]\)\)/g),
    ).toHaveLength(publishingTables.length);
    expect(migration).not.toContain("grant select on public.rescue_story_profile to anon");
    expect(migration).not.toContain("grant select on public.recipient_notification_draft to anon");
    expect(migration).toContain(staffGate);
  });

  test("stores separate public-safe and internal rescue locations", () => {
    expect(migration).toContain("public_map_label text");
    expect(migration).toContain("public_lat numeric(9, 6)");
    expect(migration).toContain("public_lng numeric(9, 6)");
    expect(migration).toContain("internal_address text");
    expect(migration).toContain("internal_location_notes text");
    expect(migration).toContain("check (public_lat is null or public_lat between -90 and 90)");
    expect(migration).toContain("check (public_lng is null or public_lng between -180 and 180)");
  });

  test("keeps cross-table story relationships on the same content item", () => {
    expect(migration.match(/unique \(id, content_item_id\)/g)).toHaveLength(2);
    expect(migration).toMatch(
      /foreign key \(cover_media_id, id\)\s+references public\.content_media\(id, content_item_id\)\s+on delete set null \(cover_media_id\)/,
    );
    expect(
      migration.match(
        /foreign key \(story_update_id, content_item_id\)\s+references public\.story_update\(id, content_item_id\)\s+on delete cascade/g,
      ),
    ).toHaveLength(3);
    expect(migration).toContain(
      "story_update_id uuid not null,\n  content_item_id uuid not null references public.content_item(id)",
    );
  });

  test("tracks updated timestamps on mutable publishing tables", () => {
    expect(migration).toContain("updated_at timestamptz not null default now()");

    for (const table of [
      "content_item",
      "content_link",
      "rescue_story_profile",
      "story_update",
      "content_media",
      "social_copy_variant",
      "recipient_notification_draft",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
  });
});
