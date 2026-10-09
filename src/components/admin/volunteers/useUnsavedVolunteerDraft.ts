import { useBlocker } from "@tanstack/react-router";
import { useSharedAdminCopy } from "../i18n/copy";
import { volunteerCommonCopy } from "./volunteerCommonCopy";

/**
 * Preserve an edited policy on SPA navigation as well as document unload. The prompt is `prompt`
 * when the caller has its own text; otherwise it is written in the admin's language, and a page
 * outside the admin language provider gets Chinese, as it always had.
 */
export function useUnsavedVolunteerDraft(dirty: boolean, prompt?: string) {
  const defaultPrompt = useSharedAdminCopy(volunteerCommonCopy).leaveDraftPrompt;
  useBlocker({
    disabled: !dirty,
    enableBeforeUnload: dirty,
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname && !window.confirm(prompt ?? defaultPrompt),
  });
}
