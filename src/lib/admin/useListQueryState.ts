import { useEffect, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";

export type ListRouteState<Filters> = {
  key: string;
  read: (params: URLSearchParams, defaults: Filters) => { filters: Filters; page: number };
  write: (params: URLSearchParams, filters: Filters, page: number) => void;
};

export function parseListPage(raw: string | null) {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 && value <= 100000 ? value : 1;
}

/**
 * Shared admin-list state. Free-text queries stay in this tab's session storage,
 * while routeState only serializes non-sensitive filters and page.
 */
export function useListQueryState<Filters extends object>({
  key,
  initialFilters,
  initialPage = 1,
  routeState,
  debounceMs = 300,
  onScopeChange,
}: {
  key: string;
  initialFilters: Filters;
  initialPage?: number;
  routeState?: ListRouteState<Filters>;
  debounceMs?: number;
  onScopeChange?: () => void;
}) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(initialPage);
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [hydrated, setHydrated] = useState(typeof window === "undefined");
  const scopeChange = useRef(onScopeChange);
  scopeChange.current = onScopeChange;
  const route = useRef(routeState);
  const defaults = useRef(initialFilters);
  const historyMode = useRef<"push" | "replace">("replace");
  const storageKey = "hkscda.admin.list.query." + key;

  useEffect(() => {
    const current = route.current;
    if (current) {
      const restored = current.read(new URLSearchParams(window.location.search), defaults.current);
      setFilters(restored.filters);
      setPage(restored.page);
    }
    let stored = "";
    try {
      stored = window.sessionStorage.getItem(storageKey) ?? "";
    } catch {
      // Session persistence is optional when browser storage is unavailable.
    }
    setDraftQuery(stored);
    setQuery(stored.trim());
    setHydrated(true);
    const onPopState = () => {
      const currentRoute = route.current;
      if (!currentRoute) return;
      const restored = currentRoute.read(
        new URLSearchParams(window.location.search),
        defaults.current,
      );
      historyMode.current = "replace";
      setFilters(restored.filters);
      setPage(restored.page);
      scopeChange.current?.();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // Route identity and defaults belong to this mounted list.
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated || !route.current) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("q");
    route.current.write(params, filters, page);
    const next = params.toString();
    const current = window.location.search.replace(/^\?/, "");
    if (next !== current)
      window.history[historyMode.current === "push" ? "pushState" : "replaceState"](
        window.history.state,
        "",
        window.location.pathname + (next ? "?" + next : "") + window.location.hash,
      );
    historyMode.current = "replace";
  }, [filters, hydrated, page]);

  useEffect(() => {
    if (!hydrated || composing || draftQuery.trim() === query) return;
    const timer = window.setTimeout(() => {
      const next = draftQuery.trim();
      try {
        window.sessionStorage.setItem(storageKey, next);
      } catch {
        // Keep searching in memory if storage is blocked or full.
      }
      setQuery(next);
      if (page !== 1) historyMode.current = "push";
      setPage(1);
      scopeChange.current?.();
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [composing, debounceMs, draftQuery, hydrated, page, query, storageKey]);

  function changeFilter(patch: Partial<Filters>) {
    historyMode.current = "push";
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
    scopeChange.current?.();
  }

  function changePage(value: number | ((current: number) => number)) {
    historyMode.current = "push";
    setPage(value);
  }

  function changeQuery(event: ChangeEvent<HTMLInputElement>) {
    setDraftQuery(event.target.value);
  }

  function endComposition(event: CompositionEvent<HTMLInputElement>) {
    setDraftQuery(event.currentTarget.value);
    setComposing(false);
  }

  return {
    filters,
    page,
    query,
    draftQuery,
    hydrated,
    isDebouncing: composing || draftQuery.trim() !== query,
    setPage: changePage,
    changeFilter,
    queryInput: {
      value: draftQuery,
      onChange: changeQuery,
      onCompositionStart: () => setComposing(true),
      onCompositionEnd: endComposition,
    },
  };
}
