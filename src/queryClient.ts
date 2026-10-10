import { isServer, QueryClient } from "@tanstack/react-query";

import { shouldRetryQuery } from "./components/admin/failureClass";

/**
 * The app's query client. In the browser a query is retried as React Query would by default,
 * except after a lapsed session, so the sign-in redirect is not held back by about seven
 * seconds of back-off. On the server it keeps React Query's default of no retries. Mutation
 * retry is left at its default (none).
 */
export function createQueryClient({ server = isServer }: { server?: boolean } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => !server && shouldRetryQuery(failureCount, error),
      },
    },
  });
}
