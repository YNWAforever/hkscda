import { defineAdminCopy } from "../i18n/copy";

/**
 * Copy for the content API errors the editor and the create form explain themselves
 * (`contentApiErrors.ts`): the refusal to write outbound copy for an unpublished story.
 */
export const contentApiErrorsCopy = defineAdminCopy({
  zh: {
    notPublished: "故事尚未發布，未能產生文案或通知草稿。請先發布故事，連結才會指向公開頁面。",
  },
  en: {
    notPublished:
      "This story isn’t published yet, so there is no public page to link to. Publish the story, then generate the copy or notification drafts.",
  },
});
