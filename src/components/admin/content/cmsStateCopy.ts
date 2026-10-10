import { defineAdminCopy } from "../i18n/copy";

export type CmsWorkflowState = "draft" | "in_review" | "published" | "archived";

/**
 * The name of each state of the draft / in review / published / archived four-eyes workflow used
 * by the payment methods and adoption guide release screens, so the raw lowercase enum value is
 * never shown to admins directly.
 */
export const cmsStateCopy = defineAdminCopy<Record<CmsWorkflowState, string>>({
  zh: {
    draft: "草稿",
    in_review: "審閱中",
    published: "已發佈",
    archived: "已封存",
  },
  en: {
    draft: "Draft",
    in_review: "In review",
    published: "Published",
    archived: "Archived",
  },
});
