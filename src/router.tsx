import { createRouter } from "@tanstack/react-router";
import { RouteError } from "./components/site/RouteError";
import { currentCspNonce } from "./lib/csp-nonce";
import { createQueryClient } from "./queryClient";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = createQueryClient();
  // Read the nonce when TanStack stamps scripts, not when this factory first runs.
  // Start may reuse one router across requests; a snapshot here would stamp a stale
  // or missing nonce while each response's CSP header gets a fresh one.
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ssr: {
      get nonce() {
        return currentCspNonce();
      },
    },
    // A page that throws renders inside the public shell instead of replacing it.
    defaultErrorComponent: RouteError,
  });

  return router;
};
