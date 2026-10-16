import { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useListQueryState } from "../useListQueryState";

type Read = { q: string; status: string; page: number };
const reads: Read[] = [];
const frames: { reads: Read[] }[] = [];
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function List() {
  const state = useListQueryState({
    key: "mount-fixture",
    initialFilters: { status: "default" },
    routeState: {
      key: "mount-fixture",
      read: (params) => ({
        filters: { status: params.get("status") ?? "default" },
        page: Number(params.get("page") ?? 1),
      }),
      write: (params, filters, page) => {
        params.set("status", filters.status);
        params.set("page", String(page));
      },
    },
  });
  useQuery({
    queryKey: ["mount-fixture", state.filters, state.query, state.page],
    enabled: state.hydrated,
    queryFn: async () => {
      const value = { q: state.query, status: state.filters.status, page: state.page };
      reads.push(value);
      return value;
    },
  });
  useLayoutEffect(() => {
    requestAnimationFrame(() => {
      frames.push({ reads: [...reads] });
      document.querySelector("output")!.textContent = JSON.stringify({ frames, reads });
    });
  }, []);
  return <p>{state.hydrated ? "restored" : "restoring"}</p>;
}

document.querySelector("button")!.addEventListener("click", () => {
  createRoot(document.querySelector("#list")!).render(
    <QueryClientProvider client={client}>
      <List />
    </QueryClientProvider>,
  );
});
