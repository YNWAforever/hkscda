import { useEffect, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import type { AnimalListState } from "./adminListState";

/** Keep typing local while the URL represents the last committed list search. */
export function useAnimalSearch(state: AnimalListState, onQueryChange: (query: string) => void) {
  const { q, archived, status, page } = state;
  const [draft, setDraft] = useState(q);
  const [composing, setComposing] = useState(false);
  const change = useRef(onQueryChange);
  change.current = onQueryChange;

  // Back/forward and restored filters win over any uncommitted input.
  useEffect(() => {
    setDraft(q);
    setComposing(false);
  }, [q, archived, status, page]);

  useEffect(() => {
    if (composing || draft === q) return;
    const timer = window.setTimeout(() => change.current(draft), 300);
    return () => window.clearTimeout(timer);
  }, [composing, draft, q, archived, status, page]);

  return {
    reset: () => {
      setDraft("");
      setComposing(false);
    },
    input: {
      value: draft,
      onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
      onCompositionStart: () => setComposing(true),
      onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => {
        setDraft(event.currentTarget.value);
        setComposing(false);
      },
    },
  };
}
