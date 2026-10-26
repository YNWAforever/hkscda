import { useEffect, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import { updateAnimalListFilters, type AnimalListState } from "./adminListState";

const stateKey = ({ q, archived, status, page }: AnimalListState) =>
  JSON.stringify([q, archived, status, page]);

/** Keep typing local while the URL represents the last committed list search. */
export function useAnimalSearch(
  state: AnimalListState,
  onStateChange: (state: AnimalListState) => void,
) {
  const { q, archived, status, page } = state;
  const [draft, setDraft] = useState(q);
  const [composing, setComposing] = useState(false);
  const change = useRef(onStateChange);
  change.current = onStateChange;
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<{ key: string; filter: boolean } | null>(null);
  const key = stateKey(state);
  const cancelTimer = () => window.clearTimeout(timer.current);

  // Back/forward and restored filters win over any uncommitted input.
  useEffect(() => {
    const ownCommit = pending.current?.key === key;
    pending.current = null;
    // An async navigation acknowledges a snapshot, not the current input.
    if (ownCommit) return;
    setDraft(q);
    setComposing(false);
  }, [key, q]);

  // Back can cancel a pending navigation without changing the rendered URL state.
  useEffect(() => {
    const restore = () => {
      cancelTimer();
      pending.current = null;
      setDraft(q);
      setComposing(false);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [q]);

  useEffect(() => {
    if (composing || draft === q || pending.current?.filter) return;
    timer.current = window.setTimeout(() => {
      const next = updateAnimalListFilters({ q, archived, status, page }, { q: draft });
      pending.current = { key: stateKey(next), filter: false };
      change.current(next);
    }, 300);
    return cancelTimer;
  }, [composing, draft, q, archived, status, page]);

  return {
    reset: (next: AnimalListState) => {
      cancelTimer();
      const nextKey = stateKey(next);
      pending.current = nextKey === key ? null : { key: nextKey, filter: true };
      setDraft(next.q);
      setComposing(false);
      change.current(next);
    },
    input: {
      value: draft,
      onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
      onCompositionStart: () => {
        cancelTimer();
        setComposing(true);
      },
      onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => {
        setDraft(event.currentTarget.value);
        setComposing(false);
      },
    },
  };
}
