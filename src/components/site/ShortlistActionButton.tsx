import { Check, Plus } from "lucide-react";

import type { Animal } from "../../types/animal";
import { intentForAnimalType } from "../../lib/publicAdoption/shortlist";
import { useShortlist } from "./ShortlistContext";

const ADD_LABEL: Record<"adoption" | "sponsorship", string> = {
  adoption: "加入領養清單",
  sponsorship: "加入助養清單",
};

export function ShortlistActionButton({
  animal,
  compact = false,
}: {
  animal: Animal;
  compact?: boolean;
}) {
  const { addItem, findItem, removeItem } = useShortlist();
  const selected = findItem(animal.id);
  const animalType = animal.type;

  if (animalType !== "cat" && animalType !== "dog" && animalType !== "sponsor") {
    return null;
  }

  const intent = intentForAnimalType(animalType);

  if (selected) {
    return (
      <button
        type="button"
        onClick={() => removeItem(animal.id)}
        className={
          compact
            ? "btn-secondary min-h-11 mt-auto w-full text-xs"
            : "btn-secondary min-h-11 w-full"
        }
      >
        <Check className="h-4 w-4" />
        已加入，按此移除
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() =>
        addItem({
          id: animal.id,
          name: animal.name,
          animalType,
          imageUrl: animal.image_url,
          intent,
        })
      }
      className={
        compact ? "btn-primary min-h-11 mt-auto w-full text-xs" : "btn-primary min-h-11 w-full"
      }
    >
      <Plus className="h-4 w-4" />
      {ADD_LABEL[intent]}
    </button>
  );
}
