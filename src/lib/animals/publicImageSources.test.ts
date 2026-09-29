import { expect, test } from "bun:test";
import { publicAnimalImageSources } from "./publicImageSources";

const origin = "https://example.supabase.co";
test("only opt-in public animal photos receive responsive variants", () => {
  const publicUrl = origin + "/storage/v1/object/public/animal-images/cat.jpg";
  expect(publicAnimalImageSources(publicUrl, origin, false)).toBeNull();
  const variants = publicAnimalImageSources(publicUrl, origin, true);
  expect(variants?.srcSet).toContain("360w");
  expect(variants?.srcSet).toContain("720w");
  expect(variants?.srcSet).toContain("1080w");
  expect(
    publicAnimalImageSources(
      origin + "/storage/v1/object/public/animal-draft-images/cat.jpg",
      origin,
      true,
    ),
  ).toBeNull();
  expect(
    publicAnimalImageSources(
      "https://other.invalid/storage/v1/object/public/animal-images/cat.jpg",
      origin,
      true,
    ),
  ).toBeNull();
});
