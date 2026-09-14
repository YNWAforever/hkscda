import { describe, expect, test } from "bun:test";
import {
  adminListSearchSchema,
  animalListDefaults,
  rememberAnimalTab,
  getAnimalListPage,
  updateAnimalListFilters,
} from "./adminListState";
import type { Animal } from "../../types/animal";
const animal = (id: string, overrides: Partial<Animal> = {}): Animal => ({
  id,
  type: "cat",
  name: `Animal ${id}`,
  name_en: null,
  gender: "male",
  age: "1",
  age_en: null,
  description: null,
  description_en: null,
  notes: null,
  notes_en: null,
  status: "available",
  image_url: null,
  created_at: "",
  updated_at: "",
  ...overrides,
});
describe("animal workspace state", () => {
  test("sanitizes malformed URL values and preserves old destinations", () => {
    expect(
      adminListSearchSchema.parse({
        section: "invalid",
        q: [],
        archived: "false",
        status: "invalid",
        page: -3,
      }),
    ).toEqual({ section: "cat", ...animalListDefaults });
    for (const page of [0, -1, 1.2, Infinity, "junk", true])
      expect(adminListSearchSchema.parse({ page }).page).toBe(1);
    expect(
      adminListSearchSchema.parse({ section: "payments", page: "2", archived: "true" }),
    ).toMatchObject({ section: "payments", page: 2, archived: true });
  });
  test("remembers each tab independently and allows history to replace only the active tab", () => {
    const cats = { ...animalListDefaults, q: "Mimi", page: 3 };
    const dogs = { ...animalListDefaults, status: "adopted" as const };
    let tabs = rememberAnimalTab({}, "cat", cats);
    tabs = rememberAnimalTab(tabs, "dog", dogs);
    expect(tabs.cat).toEqual(cats);
    tabs = rememberAnimalTab(tabs, "cat", { ...cats, q: "Earlier", page: 1 });
    expect(tabs.dog).toEqual(dogs);
    expect(tabs.cat?.q).toBe("Earlier");
    expect(updateAnimalListFilters(cats, { archived: true }).page).toBe(1);
  });
  test("combines archive, name and status before pagination and clamps stale pages", () => {
    const rows = Array.from({ length: 25 }, (_, i) => animal(String(i)));
    rows.push(
      animal("archived", { retired_at: "2026-01-01" }),
      animal("adopted", { status: "adopted" }),
    );
    const page = getAnimalListPage(rows, { ...animalListDefaults, page: 2, status: "available" });
    expect(page.total).toBe(25);
    expect(page.rows).toHaveLength(5);
    expect(page.rows[0]?.id).toBe("20");
    expect(getAnimalListPage(rows, { ...animalListDefaults, q: "archived" }).total).toBe(0);
    expect(
      getAnimalListPage(rows, { ...animalListDefaults, q: "archived", archived: true, page: 99 }),
    ).toMatchObject({ total: 1, page: 1, pageCount: 1 });
    expect(
      getAnimalListPage(rows, { ...animalListDefaults, status: "adopted" }).rows.map(
        (row) => row.id,
      ),
    ).toEqual(["adopted"]);
    expect(getAnimalListPage([], animalListDefaults)).toMatchObject({
      total: 0,
      page: 1,
      pageCount: 1,
    });
  });
});
