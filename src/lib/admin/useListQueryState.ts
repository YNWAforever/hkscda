import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
} from "react";

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
  clientOnly = false,
  debounceMs = 300,
  onScopeChange,
}: {
  key: string;
  initialFilters: Filters;
  initialPage?: number;
  routeState?: ListRouteState<Filters>;
  /** Only routes that disable SSR may restore browser state during their initial render. */
  clientOnly?: boolean;
  debounceMs?: number;
  onScopeChange?: () => void;
}) {
  const storageKey = "hkscda.admin.list.query." + key;
  const [initial] = useState(() => {
    const ready = clientOnly && typeof window !== "undefined";
    const restored =
      ready && routeState
        ? routeState.read(new URLSearchParams(window.location.search), initialFilters)
        : { filters: initialFilters, page: initialPage };
    let stored = "";
    if (ready) {
      try {
        stored = window.sessionStorage.getItem(storageKey) ?? "";
      } catch {
        /* Session persistence is optional. */
      }
    }
    return {
      ...restored,
      draftQuery: stored,
      query: stored.trim(),
      hydrated: ready || typeof window === "undefined",
    };
  });
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [page, setPage] = useState(initial.page);
  const [draftQuery, setDraftQuery] = useState(initial.draftQuery);
  const [query, setQuery] = useState(initial.query);
  const [composing, setComposing] = useState(false);
  const [hydrated, setHydrated] = useState(initial.hydrated);
  const scopeChange = useRef(onScopeChange);
  scopeChange.current = onScopeChange;
  const route = useRef(routeState);
  const defaults = useRef(initialFilters);
  const historyMode = useRef<"push" | "replace">("replace");

  // Restore the mounted list before paint, so its enabled query can subscribe
  // without waiting for a second render frame. Keep it disabled until the saved
  // search and route filters are restored together.
  useLayoutEffect(() => {
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
    const onIdentityCleared = () => {
      setDraftQuery("");
      setQuery("");
      setPage(1);
      setFilters(defaults.current);
      scopeChange.current?.();
    };
    window.addEventListener("hkscda-admin-identity-cleared", onIdentityCleared);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hkscda-admin-identity-cleared", onIdentityCleared);
    };
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
  function submitQuery() {
    if (composing) return;
    const next = draftQuery.trim();
    try {
      window.sessionStorage.setItem(storageKey, next);
    } catch {
      /* Optional persistence. */
    }
    setQuery(next);
    setPage(1);
    scopeChange.current?.();
  }
  function clearQuery() {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      /* Optional persistence. */
    }
    setDraftQuery("");
    setQuery("");
    setPage(1);
    scopeChange.current?.();
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
    submitQuery,
    clearQuery,
    queryInput: {
      value: draftQuery,
      onChange: changeQuery,
      onCompositionStart: () => setComposing(true),
      onCompositionEnd: endComposition,
    },
  };
}
