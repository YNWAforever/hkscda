import { useBlocker } from "@tanstack/react-router";
/** Preserve an edited policy on SPA navigation as well as document unload. */
export function useUnsavedVolunteerDraft(dirty: boolean) {
  useBlocker({
    disabled: !dirty,
    enableBeforeUnload: dirty,
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname && !window.confirm("目前有未儲存修改，確定捨棄並離開？"),
  });
}
