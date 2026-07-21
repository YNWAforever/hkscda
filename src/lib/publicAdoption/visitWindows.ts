export const DOG_VISIT_WINDOWS = ["weekday_afternoon", "weekend_afternoon"] as const;

export const CAT_VISIT_WINDOWS = [
  "weekday_morning",
  "weekday_afternoon",
  "weekday_evening",
  "weekend_morning",
  "weekend_afternoon",
] as const;

export const VISIT_WINDOWS = CAT_VISIT_WINDOWS;

export type AdoptionSpecies = "dog" | "cat";
export type DogVisitWindow = (typeof DOG_VISIT_WINDOWS)[number];
export type CatVisitWindow = (typeof CAT_VISIT_WINDOWS)[number];
export type VisitWindow = (typeof VISIT_WINDOWS)[number];

export type GroupedVisitWindows = {
  dog: DogVisitWindow[];
  cat: CatVisitWindow[];
};

type VisitWindowInput = {
  dog?: readonly unknown[] | null;
  cat?: readonly unknown[] | null;
};

type VisitWindowRow = {
  dog_time_windows?: readonly unknown[] | null;
  cat_time_windows?: readonly unknown[] | null;
  preferred_time_windows?: readonly unknown[] | null;
};

function orderedValues<T extends string>(options: readonly T[], values: readonly unknown[] | null) {
  const selected = new Set(values ?? []);
  return options.filter((option) => selected.has(option));
}

export function normalizeVisitWindows(
  species: readonly AdoptionSpecies[],
  windows: VisitWindowInput,
): GroupedVisitWindows {
  const selectedSpecies = new Set(species);
  return {
    dog: selectedSpecies.has("dog") ? orderedValues(DOG_VISIT_WINDOWS, windows.dog ?? []) : [],
    cat: selectedSpecies.has("cat") ? orderedValues(CAT_VISIT_WINDOWS, windows.cat ?? []) : [],
  };
}

export function readVisitWindows(
  row: VisitWindowRow,
  species: readonly AdoptionSpecies[],
): GroupedVisitWindows {
  return normalizeVisitWindows(species, {
    dog: row.dog_time_windows ?? row.preferred_time_windows ?? [],
    cat: row.cat_time_windows ?? row.preferred_time_windows ?? [],
  });
}
