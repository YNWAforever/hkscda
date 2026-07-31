import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADOPTION_INSTRUCTIONS_PAGE_KEY,
  initialAdoptionInstructionContent,
} from "./content";
import { adoptionInstructionContentSchema } from "./schemas";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260802100000_adoption_instruction_page_cms.sql",
);

describe("adoption instructions content schema", () => {
  test("parses the initial document", () => {
    const parsed = adoptionInstructionContentSchema.safeParse(initialAdoptionInstructionContent);

    expect(parsed.success).toBe(true);
  });

  test("accepts reordered topics with stable IDs", () => {
    const reorderedTopics = [...initialAdoptionInstructionContent.care.cat.topics].reverse();

    expect(
      adoptionInstructionContentSchema.safeParse({
        ...initialAdoptionInstructionContent,
        care: {
          ...initialAdoptionInstructionContent.care,
          cat: { ...initialAdoptionInstructionContent.care.cat, topics: reorderedTopics },
        },
      }).success,
    ).toBe(true);
  });

  test("rejects empty required titles", () => {
    expect(
      adoptionInstructionContentSchema.safeParse({
        ...initialAdoptionInstructionContent,
        hero: { ...initialAdoptionInstructionContent.hero, title: "" },
      }).success,
    ).toBe(false);
  });

  test("rejects duplicate rule IDs", () => {
    expect(
      adoptionInstructionContentSchema.safeParse({
        ...initialAdoptionInstructionContent,
        rules: {
          ...initialAdoptionInstructionContent.rules,
          items: [
            initialAdoptionInstructionContent.rules.items[0],
            initialAdoptionInstructionContent.rules.items[0],
          ],
        },
      }).success,
    ).toBe(false);
  });

  test("rejects duplicate topic IDs", () => {
    expect(
      adoptionInstructionContentSchema.safeParse({
        ...initialAdoptionInstructionContent,
        care: {
          ...initialAdoptionInstructionContent.care,
          dog: {
            ...initialAdoptionInstructionContent.care.dog,
            topics: [
              initialAdoptionInstructionContent.care.dog.topics[0],
              initialAdoptionInstructionContent.care.dog.topics[0],
            ],
          },
        },
      }).success,
    ).toBe(false);
  });

  test("rejects duplicate topic values when topic IDs differ", () => {
    const [firstTopic, secondTopic] = initialAdoptionInstructionContent.care.cat.topics;

    expect(
      adoptionInstructionContentSchema.safeParse({
        ...initialAdoptionInstructionContent,
        care: {
          ...initialAdoptionInstructionContent.care,
          cat: {
            ...initialAdoptionInstructionContent.care.cat,
            topics: [firstTopic, { ...secondTopic, value: firstTopic.value }],
          },
        },
      }).success,
    ).toBe(false);
  });

  test("rejects markup and URLs in plain-text fields", () => {
    expect(
      adoptionInstructionContentSchema.safeParse({
        ...initialAdoptionInstructionContent,
        hero: {
          ...initialAdoptionInstructionContent.hero,
          description: "<script>alert(1)</script>",
        },
      }).success,
    ).toBe(false);
    expect(
      adoptionInstructionContentSchema.safeParse({
        ...initialAdoptionInstructionContent,
        hero: { ...initialAdoptionInstructionContent.hero, description: "https://example.test" },
      }).success,
    ).toBe(false);
    expect(
      adoptionInstructionContentSchema.safeParse({
        ...initialAdoptionInstructionContent,
        hero: { ...initialAdoptionInstructionContent.hero, description: "www.example.test" },
      }).success,
    ).toBe(false);
  });

  test("keeps the SQL seed reviewable against the application seed", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain(ADOPTION_INSTRUCTIONS_PAGE_KEY);
    for (const key of Object.keys(initialAdoptionInstructionContent)) {
      expect(migration).toContain(`\"${key}\"`);
    }
    expect(migration).toContain(initialAdoptionInstructionContent.hero.title);
    expect(migration).toContain(initialAdoptionInstructionContent.rules.items[0].text);
    expect(migration).toContain(initialAdoptionInstructionContent.rules.items.at(-1)!.text);
    expect(migration).toContain(initialAdoptionInstructionContent.care.cat.topics[0].value);
    expect(migration).toContain(initialAdoptionInstructionContent.care.cat.topics.at(-1)!.value);
    expect(migration).toContain(initialAdoptionInstructionContent.care.dog.topics[0].value);
    expect(migration).toContain(initialAdoptionInstructionContent.care.dog.topics.at(-1)!.value);
    expect(migration).toContain("www\\.");
    expect(migration).not.toContain("www\\\\.");
  });

  test("keeps SQL fixed-field limits aligned with the application schema", () => {
    const migration = readFileSync(migrationPath, "utf8");

    for (const [path, max] of [
      ["hero.eyebrow", 120],
      ["hero.title", 180],
      ["hero.description", 500],
      ["fees.sectionTitle", 180],
      ["fees.itemLabel", 120],
      ["fees.notice", 500],
      ["estates.introduction", 500],
      ["guides.zhHkActionLabel", 120],
      ["rules.title", 180],
      ["care.cat.title", 180],
    ]) {
      expect(migration).toContain(`when '${path}' then ${max}`);
    }
  });

  test("uses the seed document as the route rules and care copy source", () => {
    const routeSource = readFileSync(
      join(process.cwd(), "src", "routes", "adoption", "instructions.tsx"),
      "utf8",
    );

    expect(routeSource).toContain('import { initialAdoptionInstructionContent }');
    expect(routeSource).not.toContain("const adoptionRules =");
    expect(routeSource).not.toContain("const catCareTopics =");
    expect(routeSource).not.toContain("const dogCareTopics =");
    expect(routeSource).toContain(
      'defaultValue={initialAdoptionInstructionContent.care.cat.topics[0]?.value}',
    );
    expect(routeSource).toContain(
      'defaultValue={initialAdoptionInstructionContent.care.dog.topics[0]?.value}',
    );
    for (const path of [
      "fees.sectionTitle",
      "fees.dogTitle",
      "fees.catTitle",
      "fees.itemLabel",
      "fees.amountLabel",
      "fees.notice",
      "estates.sectionTitle",
      "estates.introduction",
      "estates.estateLabel",
      "estates.districtLabel",
      "estates.notesLabel",
      "estates.emptyState",
      "guides.sectionTitle",
      "guides.catTitle",
      "guides.dogTitle",
      "guides.generalTitle",
      "guides.zhHkActionLabel",
      "guides.enActionLabel",
    ]) {
      expect(routeSource).toContain(`initialAdoptionInstructionContent.${path}`);
    }
  });
});
