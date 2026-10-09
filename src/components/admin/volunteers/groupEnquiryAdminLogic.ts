import type { GroupEnquiryStatus } from "../../../lib/groupEnquiries/types";

export const GROUP_ENQUIRY_PAGE_SIZE = 25;

// The labels of the statuses, activity types and notification statuses are in `groupEnquiryCopy`,
// where the screen reads them in the admin's language. They used to be rendered raw —
// "in_progress" and "retryNotification" sat on buttons in an otherwise Chinese admin.

/**
 * Status transitions worth offering from the enquiry's current state.
 *
 * The old panel always rendered in_progress / resolved / closed, so the button
 * matching the current status was a visible no-op.
 */
export function availableEnquiryTransitions(current: GroupEnquiryStatus): GroupEnquiryStatus[] {
  return (["in_progress", "resolved", "closed"] as GroupEnquiryStatus[]).filter(
    (status) => status !== current,
  );
}

export function buildGroupEnquirySearchParams(input: {
  q: string;
  status: GroupEnquiryStatus | "all" | "";
  page: number;
}) {
  const params = new URLSearchParams({
    page: String(Math.max(1, Math.trunc(input.page || 1))),
    pageSize: String(GROUP_ENQUIRY_PAGE_SIZE),
  });
  const q = input.q.trim();
  if (q) params.set("q", q);
  if (input.status && input.status !== "all") params.set("status", input.status);
  return params;
}
