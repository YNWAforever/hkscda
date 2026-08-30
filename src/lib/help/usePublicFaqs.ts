import { queryOptions } from "@tanstack/react-query";

import { getPublicFaqs } from "../faq/publicPage.functions";

export const PUBLIC_FAQS_QUERY_KEY = ["public-faqs"] as const;

/**
 * FAQ content changes rarely (an occasional admin edit), so a 5-minute
 * staleTime means most page navigations within a session reuse the cached
 * list instead of refetching — the same staleTime rationale as
 * ADMIN_IDENTITY_STALE_TIME_MS, applied to a much lower-churn resource.
 */
export const PUBLIC_FAQS_STALE_TIME_MS = 5 * 60_000;

export function publicFaqsQueryOptions() {
  return queryOptions({
    queryKey: PUBLIC_FAQS_QUERY_KEY,
    queryFn: () => getPublicFaqs(),
    staleTime: PUBLIC_FAQS_STALE_TIME_MS,
  });
}
