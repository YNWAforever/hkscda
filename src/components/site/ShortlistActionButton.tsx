import { Check, Plus } from "lucide-react";

import type { Animal } from "../../types/animal";
import { useShortlist } from "./ShortlistProvider";

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

  if (animalType !== "cat" && animalType !== "dog") {
    return null;
  }

  if (selected) {
    return (
      <button
        type="button"
        onClick={() => removeItem(animal.id)}
        className={compact ? "btn-outline mt-auto text-xs! py-1.5! px-3!" : "btn-outline py-3!"}
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
          intent: "adoption",
        })
      }
      className={compact ? "btn-cta mt-auto text-xs! py-1.5! px-3!" : "btn-cta py-3!"}
    >
      <Plus className="h-4 w-4" />
      加入領養清單
    </button>
  );
}
