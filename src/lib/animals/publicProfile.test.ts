import { expect, test } from "bun:test";
import type { Animal } from "../../types/animal";
import { parsePublicAnimalProfile, projectPublicAnimal } from "./publicProfile";

const animal: Animal = {
  id: "a",
  type: "cat",
  name: "Cat",
  name_en: null,
  gender: "female",
  age: "不詳",
  age_en: null,
  description: null,
  description_en: null,
  notes: "Internal contact",
  notes_en: "private",
  status: "available",
  image_url: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};
test("public profile excludes private keys and rejects invalid fields independently", () => {
  const profile = parsePublicAnimalProfile({
    code: " C807 ",
    birthday: "2024-02-30",
    neutered: "null",
    suitability: "newbie",
    remarks: "private",
    personality: "<script>private</script>",
    health: "Contact test@example.com",
    story: "A verified rescue story",
    recordDate: "2026-09-07",
  });
  expect(profile).toEqual({
    code: "C807",
    birthday: null,
    neutered: null,
    suitability: "newbie",
    personality: null,
    health: null,
    story: "A verified rescue story",
    recordDate: "2026-09-07",
  });
});
test("pre-migration animals keep their age and lose internal notes", () => {
  const result = projectPublicAnimal({
    ...animal,
    age: "2 歲",
    private_marker: "secret",
  } as Animal);
  expect(result.age).toBe("2 歲");
  expect(result.notes).toBeNull();
  expect(result.notes_en).toBeNull();
  expect(result).not.toHaveProperty("private_marker");
  expect(result.public_profile?.neutered).toBeNull();
});
test("age uses Hong Kong day with an injected clock, and preserves false neutering", () => {
  const result = projectPublicAnimal(
    {
      ...animal,
      public_profile: parsePublicAnimalProfile({ birthday: "2025-09-07", neutered: false }),
    },
    () => new Date("2026-09-06T17:00:00Z"),
  );
  expect(result.age).toBe("1 歲");
  expect(result.public_profile?.neutered).toBe(false);
});
test("young animals retain completed months and future birthdays never create negative age", () => {
  const now = () => new Date("2026-09-07T00:00:00Z");
  expect(
    projectPublicAnimal(
      { ...animal, public_profile: parsePublicAnimalProfile({ birthday: "2026-06-08" }) },
      now,
    ).age,
  ).toBe("2 個月");
  const result = projectPublicAnimal(
    { ...animal, public_profile: parsePublicAnimalProfile({ birthday: "2027-01-01" }) },
    now,
  );
  expect(result.age).toBe("不詳");
  expect(result.public_profile?.birthday).toBeNull();
});
test("contact identifiers and oversized text never leave the public projection", () => {
  expect(
    parsePublicAnimalProfile({ health: "Call 9123 4567", story: "x".repeat(8001) }).health,
  ).toBeNull();
  expect(parsePublicAnimalProfile({ story: "x".repeat(8001) }).story).toBeNull();
});
