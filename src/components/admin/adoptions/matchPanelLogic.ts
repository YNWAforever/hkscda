import type { CoordinatorStatus } from "../../../lib/adoptions/types";

type AnimalOptionLabelInput = {
  name: string;
  name_en: string | null;
  type: string;
  status: string;
};

export function formatAnimalOptionLabel(animal: AnimalOptionLabelInput) {
  const englishName = animal.name_en ? ` / ${animal.name_en}` : "";
  return `${animal.name}${englishName} (${animal.type} · ${animal.status})`;
}

export function getDefaultMatchStatusId(statuses: CoordinatorStatus[]) {
  return (
    statuses.find((status) => status.key === "proposed")?.id ??
    statuses.find((status) => status.key === "suggested")?.id ??
    statuses[0]?.id ??
    ""
  );
}
