export function resolveAvailableShelter(selected: string, shelters: string[]) {
  return shelters.includes(selected) ? selected : (shelters[0] ?? "");
}
