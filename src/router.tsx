import { createRouter } from "@tanstack/react-router";
import { RouteError } from "./components/site/RouteError";
import { createQueryClient } from "./queryClient";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = createQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // A page that throws renders inside the public shell instead of replacing it.
    defaultErrorComponent: RouteError,
  });

  return router;
};
