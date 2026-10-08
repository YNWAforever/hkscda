import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

function readSearchGapMigration() {
  const fileName = readdirSync(migrationsDir).find((entry) =>
    entry.endsWith("_faq_search_gaps.sql"),
  );
  if (!fileName) throw new Error("faq_search_gaps migration is missing");
  return readFileSync(join(migrationsDir, fileName), "utf8");
}

const functionSignatures = [
  "purge_faq_search_gaps()",
  "record_faq_search_gap(text, text, text)",
  "list_faq_search_gaps(integer, integer)",
];

describe("faq_search_gaps migration", () => {
  const sql = readSearchGapMigration();

  test("creates the daily-count table keyed by day, language, confidence and topic", () => {
    expect(sql).toContain("create table public.faq_search_gap");
    expect(sql).toContain("primary key (day, language, confidence, topic)");
  });

  test("buckets days in Hong Kong time", () => {
    expect(sql).toContain("at time zone 'Asia/Hong_Kong'");
  });

  test("locks the table down: RLS on, no client access", () => {
    expect(sql).toContain("alter table public.faq_search_gap enable row level security");
    expect(sql).toContain(
      "revoke all on table public.faq_search_gap from public, anon, authenticated",
    );
  });

  test.each(functionSignatures)("%s is callable only by service_role", (signature) => {
    expect(sql).toContain(
      `revoke all on function public.${signature} from public, anon, authenticated`,
    );
    expect(sql).toContain(`grant execute on function public.${signature} to service_role`);
  });

  test("all three functions are security definer with a pinned search_path", () => {
    const definerMatches = [...sql.matchAll(/security definer/g)];
    expect(definerMatches).toHaveLength(3);
    for (const match of definerMatches) {
      // The header runs from the attribute to the body delimiter.
      const header = sql.slice(match.index, sql.indexOf("as $$", match.index));
      expect(header).toContain("set search_path = public, pg_temp");
    }
  });
});
