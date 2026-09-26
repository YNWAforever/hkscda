export type CmsWorkflowState = "draft" | "in_review" | "published" | "archived";

// Shared zh-HK labels for the draft/in_review/published/archived four-eyes
// workflow used by PaymentMethodsManagement and AdoptionGuideReleaseManagement,
// so the raw English/lowercase enum value is never shown to admins directly.
export const CMS_STATE_LABELS: Record<CmsWorkflowState, string> = {
  draft: "草稿",
  in_review: "審閱中",
  published: "已發佈",
  archived: "已封存",
};
