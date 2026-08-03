import type {
  GroupEnquiryActivityType,
  GroupEnquiryNotificationStatus,
  GroupEnquiryStatus,
} from "../../../lib/groupEnquiries/types";

export const GROUP_ENQUIRY_PAGE_SIZE = 25;

// The screen rendered these enum values raw — "in_progress" and
// "retryNotification" sat on buttons in an otherwise Chinese admin.
export const groupEnquiryStatusLabels: Record<GroupEnquiryStatus, string> = {
  new: "新查詢",
  in_progress: "處理中",
  resolved: "已解決",
  closed: "已結案",
};

export const groupEnquiryActivityLabels: Record<GroupEnquiryActivityType, string> = {
  group_workshop: "團體工作坊",
  school_talk: "學校講座",
  shelter_visit: "中心參觀",
  other: "其他",
};

export const groupEnquiryNotificationLabels: Record<GroupEnquiryNotificationStatus, string> = {
  pending: "待發送",
  sent: "已發送",
  failed: "發送失敗",
};

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
