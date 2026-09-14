import { z } from "zod";
import type { Animal } from "../../types/animal";
import { filterAdminAnimals } from "./adminSearch";
import type { AdminAnimalSection } from "./adminCatalogue";

export const animalListDefaults = { q: "", archived: false, status: "all" as const, page: 1 };
export const animalListStatuses = ["all", "available", "adopted", "fostered"] as const;
export const adminListSearchSchema = z.object({
  section: z.enum(["cat", "dog", "sponsor", "applications", "payments"]).catch("cat"),
  q: z.string().max(200).catch(""),
  archived: z.preprocess((value) => value === true || value === "true", z.boolean()),
  status: z.enum(animalListStatuses).catch("all"),
  page: z.preprocess(
    (value) => (typeof value === "string" ? Number(value) : value),
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER).catch(1),
  ),
});
export type AnimalListState = Omit<z.output<typeof adminListSearchSchema>, "section">;
export type AnimalTabMemory = Partial<Record<AdminAnimalSection, AnimalListState>>;
export function rememberAnimalTab(
  memory: AnimalTabMemory,
  section: AdminAnimalSection,
  state: AnimalListState,
): AnimalTabMemory {
  return {
    ...memory,
    [section]: { q: state.q, archived: state.archived, status: state.status, page: state.page },
  };
}
export function updateAnimalListFilters(
  state: AnimalListState,
  filters: Partial<Omit<AnimalListState, "page">>,
): AnimalListState {
  return { ...state, ...filters, page: 1 };
}
export function getAnimalListPage(animals: Animal[], state: AnimalListState) {
  const filtered = filterAdminAnimals(animals, state.q, { includeArchived: state.archived }).filter(
    (animal) => state.status === "all" || animal.status === state.status,
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const page = Math.min(state.page, pageCount);
  return {
    rows: filtered.slice((page - 1) * 20, page * 20),
    filtered,
    total: filtered.length,
    page,
    pageCount,
  };
}
