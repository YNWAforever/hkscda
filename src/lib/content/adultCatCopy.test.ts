import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const oldSentence = "半歲以下仍屬幼貓";
const canonicalSentence = "半歲或以上為成貓";
const correctiveMigration = "supabase/migrations/20260718111000_correct_adult_cat_copy.sql";

describe("adult cat copy audit", () => {
  test("keeps contradictory wording out of tracked source and seed content", () => {
    const files = execFileSync("git", ["ls-files", "src", "supabase"], {
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((file) => file !== "src/lib/content/adultCatCopy.test.ts")
      .filter((file) => file !== correctiveMigration);

    const matches = files.filter((file) =>
      readFileSync(join(process.cwd(), file), "utf8").includes(oldSentence),
    );
    expect(matches).toEqual([]);
  });

  test("uses the canonical sentence publicly and narrowly repairs CMS bodies", () => {
    // This sentence used to be hardcoded directly in
    // src/routes/adoption/instructions.tsx. It now lives in the
    // adoption_rules_care_topics migration's seed data instead (the cat
    // "Health" care topic), which is what actually reaches the public page
    // at runtime since the route was migrated off static content.
    const careTopicsMigration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260830130000_adoption_rules_care_topics.sql"),
      "utf8",
    );
    const sql = readFileSync(join(process.cwd(), correctiveMigration), "utf8");

    expect(careTopicsMigration).toContain(canonicalSentence);
    expect(sql).toContain("update public.content_item");
    expect(sql).toContain("replace(body, '半歲以下仍屬幼貓', '半歲或以上為成貓')");
    expect(sql).toContain("where body like '%半歲以下仍屬幼貓%'");
    expect(sql).toContain("select id, slug, title");
    expect(sql).toContain("where body::text like '%半歲以下仍屬幼貓%'");
  });
});
