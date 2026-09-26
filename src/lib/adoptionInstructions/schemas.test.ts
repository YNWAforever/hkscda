import { describe, expect, test } from "bun:test";
import { initialAdoptionInstructionContent } from "./content";
import { adoptionInstructionContentSchema } from "./schemas";

describe("adoption page copy", () => {
  test("accepts the current page labels", () => {
    expect(
      adoptionInstructionContentSchema.safeParse(initialAdoptionInstructionContent).success,
    ).toBe(true);
  });
  test("rejects collections owned by the bilingual rules and care editors", () => {
    expect(
      adoptionInstructionContentSchema.safeParse({
        ...initialAdoptionInstructionContent,
        rules: { title: "規則", items: [] },
      }).success,
    ).toBe(false);
    expect(
      adoptionInstructionContentSchema.safeParse({
        ...initialAdoptionInstructionContent,
        care: { cat: { title: "貓", topics: [] }, dog: { title: "狗" } },
      }).success,
    ).toBe(false);
  });
  test.each([
    "",
    "<script>x</script>",
    "https://example.test",
    "www.example.test",
    "x".repeat(181),
  ])("rejects invalid titles: %s", (title) => {
    expect(
      adoptionInstructionContentSchema.safeParse({
        ...initialAdoptionInstructionContent,
        hero: { ...initialAdoptionInstructionContent.hero, title },
      }).success,
    ).toBe(false);
  });
});
