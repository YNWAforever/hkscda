import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  SHORTLIST_STORAGE_KEY,
  addShortlistItem,
  parseShortlist,
  removeShortlistItem,
  reorderAdoptionItems,
  serializeShortlist,
  type AddShortlistInput,
  type ShortlistItem,
} from "../../lib/publicAdoption/shortlist";

type ShortlistContextValue = {
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

const ShortlistContext = createContext<ShortlistContextValue | null>(null);

export function ShortlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ShortlistItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);

  useEffect(() => {
    try {
      setItems(parseShortlist(window.localStorage.getItem(SHORTLIST_STORAGE_KEY)));
    } catch {
      setPersistenceWarning("瀏覽器未能儲存清單；本次瀏覽仍可繼續選擇。");
    } finally {
      setHasLoadedStorage(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedStorage) return;

    try {
      window.localStorage.setItem(SHORTLIST_STORAGE_KEY, serializeShortlist(items));
    } catch {
      setPersistenceWarning("瀏覽器未能儲存清單；本次瀏覽仍可繼續選擇。");
    }
  }, [hasLoadedStorage, items]);

  const value = useMemo<ShortlistContextValue>(
    () => ({
      items,
      persistenceWarning,
      message,
      addItem(input) {
        setItems((current) => {
          const result = addShortlistItem(current, input);
          setMessage(result.message);
          return result.items;
        });
      },
      removeItem(animalId) {
        setItems((current) => removeShortlistItem(current, animalId));
      },
      clearMessage() {
        setMessage(null);
      },
      clear() {
        setItems([]);
      },
      reorderAdoptions(animalIds) {
        setItems((current) => reorderAdoptionItems(current, animalIds));
      },
      findItem(animalId) {
        return items.find((item) => item.id === animalId);
      },
    }),
    [items, message, persistenceWarning],
  );

  return <ShortlistContext.Provider value={value}>{children}</ShortlistContext.Provider>;
}

export function useShortlist() {
  const value = useContext(ShortlistContext);
  if (!value) throw new Error("useShortlist must be used inside ShortlistProvider");
  return value;
}
