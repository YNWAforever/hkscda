import type { JSX } from "react";

import { useSharedAdminCopy } from "../i18n/copy";
import { useLeaveConfirm } from "../useLeaveConfirm";
import { volunteerCommonCopy } from "./volunteerCommonCopy";

/**
 * Preserve an edited policy on SPA navigation as well as document unload. The question is `prompt`
 * when the caller has its own text; otherwise it is written in the admin's language, and a page
 * outside the admin language provider gets Chinese, as it always had. Render the returned element
 * anywhere in the page: it is the dialog that asks before the page is left.
 */
export function useUnsavedVolunteerDraft(dirty: boolean, prompt?: string): JSX.Element {
  const defaultPrompt = useSharedAdminCopy(volunteerCommonCopy).leaveDraftPrompt;
  return useLeaveConfirm({
    dirty,
    consequence: prompt ?? defaultPrompt,
    // Only a change of page is guarded; a change of search or hash on this page is not.
    samePathAllowed: true,
  });
}
