import { expect, test } from "bun:test";
import {
  PUBLIC_ANIMAL_BASE_COLUMNS,
  PUBLIC_ANIMAL_COLUMNS,
  readWithOptionalGallery,
} from "./publicColumns";

test("retains modern gallery result without an unnecessary second query", async () => {
  const calls: string[] = [];
  const result = { data: [{ gallery: [{ url: "real.jpg" }] }], error: null };
  expect(
    await readWithOptionalGallery(async (columns) => {
      calls.push(columns);
      return result;
    }),
  ).toBe(result);
  expect(calls).toEqual([PUBLIC_ANIMAL_COLUMNS]);
});
test("only removes gallery and retries once for the exact missing-column error", async () => {
  const calls: string[] = [];
  const failure = { error: { code: "42703", message: "column animals.gallery does not exist" } };
  expect(
    await readWithOptionalGallery(async (columns) => {
      calls.push(columns);
      return failure;
    }),
  ).toBe(failure);
  expect(calls).toEqual([PUBLIC_ANIMAL_COLUMNS, PUBLIC_ANIMAL_BASE_COLUMNS]);
  expect(PUBLIC_ANIMAL_COLUMNS.split(",").filter((c) => c !== "gallery")).toEqual(
    PUBLIC_ANIMAL_BASE_COLUMNS.split(","),
  );
  expect(PUBLIC_ANIMAL_BASE_COLUMNS.split(",")).not.toContain("notes");
});
for (const error of [
  { code: "42501", message: "permission denied for table animals" },
  { code: "42703", message: "column animals.publication_state does not exist" },
  { code: "PGRST204", message: "schema cache unavailable" },
])
  test(`does not hide ${error.code}: ${error.message}`, async () => {
    let calls = 0;
    const result = { error };
    expect(
      await readWithOptionalGallery(async () => {
        calls++;
        return result;
      }),
    ).toBe(result);
    expect(calls).toBe(1);
  });
