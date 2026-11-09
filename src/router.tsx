import { createRouter } from "@tanstack/react-router";
import { RouteError } from "./components/site/RouteError";
import { currentCspNonce } from "./lib/csp-nonce";
import { createQueryClient } from "./queryClient";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = createQueryClient();
  // The SSR request's CSP nonce (undefined in the browser, or outside the request context).
  // TanStack Router stamps it on every inline script it renders for this page, so the enforcing
  // CSP in src/lib/security-headers.ts can omit 'unsafe-inline' from script-src.
  const nonce = currentCspNonce();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(nonce ? { ssr: { nonce } } : {}),
    // A page that throws renders inside the public shell instead of replacing it.
    defaultErrorComponent: RouteError,
  });

  return router;
};
