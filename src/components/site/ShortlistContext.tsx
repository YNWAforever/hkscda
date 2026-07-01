import { createContext, useContext } from "react";

import type { AddShortlistInput, ShortlistItem } from "../../lib/publicAdoption/shortlist";

export type ShortlistContextValue = {
  items: ShortlistItem[];
  persistenceWarning: string | null;
  message: string | null;
  addItem: (item: AddShortlistInput) => void;
  removeItem: (animalId: string) => void;
  clearMessage: () => void;
  clear: () => void;
  reorderAdoptions: (animalIds: string[]) => void;
  findItem: (animalId: string) => ShortlistItem | undefined;
};

export const ShortlistContext = createContext<ShortlistContextValue | null>(null);

export function useShortlist() {
  const value = useContext(ShortlistContext);
  if (!value) throw new Error("useShortlist must be used inside ShortlistProvider");
  return value;
}
