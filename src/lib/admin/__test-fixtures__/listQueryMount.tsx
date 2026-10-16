import { startTransition, useEffect, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useListQueryState } from "../useListQueryState";

type Read = { q: string; status: string; page: number };
const reads: Read[] = [];
const frames: { reads: Read[] }[] = [];
const phases: { reads: Read[] }[] = [];
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const params = new URLSearchParams(location.search);
if (params.get("cached") === "1")
  client.setQueryData(["mount-fixture", { status: "pending" }, "", 3], {
    q: "",
    status: "pending",
    page: 3,
  });

export function List() {
  const state = useListQueryState({
    key: "mount-fixture",
    clientOnly: true,
    initialFilters: { status: params.get("status") ?? "default" },
    initialPage: Number(params.get("page") ?? 1),
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
  useEffect(() => {
    phases.push({ reads: [...reads] });
  }, []);
  useLayoutEffect(() => {
    requestAnimationFrame(() => {
      frames.push({ reads: [...reads] });
      document.querySelector("output")!.textContent = JSON.stringify({ frames, phases, reads });
    });
  }, []);
  return <p>{state.hydrated ? "restored" : "restoring"}</p>;
}

export function App() {
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <button onClick={() => startTransition(() => setMounted(true))}>Mount list</button>
      {mounted ? <List /> : null}
    </>
  );
}

createRoot(document.querySelector("#list")!).render(
  <QueryClientProvider client={client}>
    <App />
  </QueryClientProvider>,
);
