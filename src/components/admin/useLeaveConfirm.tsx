import { useRef, type JSX } from "react";
import { useBlocker } from "@tanstack/react-router";

import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { confirmActionCopy } from "./confirmActionCopy";
import { useSharedAdminCopy } from "./i18n/copy";

/**
 * Asks before the router leaves a page that has unsaved changes, in a `ConfirmActionDialog`
 * instead of the browser's own dialog. Render the returned element anywhere in the page.
 *
 * `samePathAllowed` lets a change of search or hash through, for pages that only guard
 * against leaving the page itself.
 */
export function useLeaveConfirm({
  dirty,
  consequence,
  samePathAllowed = false,
}: {
  dirty: boolean;
  consequence: string;
  samePathAllowed?: boolean;
}): JSX.Element {
  const copy = useSharedAdminCopy(confirmActionCopy);
  const proceeded = useRef(false);
  const blocker = useBlocker({
    withResolver: true,
    disabled: !dirty,
    enableBeforeUnload: dirty,
    shouldBlockFn: ({ current, next }) => !samePathAllowed || current.pathname !== next.pathname,
  });
  return (
    <ConfirmActionDialog
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (open) return;
        // Confirming also closes the dialog; the router has already been told to go on.
        if (proceeded.current) {
          proceeded.current = false;
          return;
        }
        if (blocker.status === "blocked") blocker.reset();
      }}
      title={copy.discardAndLeave}
      consequence={consequence}
      confirmLabel={copy.discardAndLeave}
      destructive
      reason="none"
      onConfirm={async () => {
        if (blocker.status !== "blocked") return;
        proceeded.current = true;
        blocker.proceed();
      }}
    />
  );
}
