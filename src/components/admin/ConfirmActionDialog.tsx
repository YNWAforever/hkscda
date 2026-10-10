import { useEffect, useReducer, useRef, type JSX } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { buttonVariants } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/utils";
import { adminErrorMessage } from "../../lib/admin/session";
import { confirmActionCopy } from "./confirmActionCopy";
import {
  CONFIRM_REASON_MAX_LENGTH,
  INITIAL_CONFIRM_STATE,
  canConfirm,
  confirmDialogReducer,
  runConfirm,
  type ConfirmReason,
} from "./confirmActionState";
import { useAdminLanguageOrDefault } from "./i18n/languageContext";
import { useSharedAdminCopy } from "./i18n/copy";

export type { ConfirmReason };

export type ConfirmActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  consequence: string;
  confirmLabel: string;
  destructive?: boolean;
  reason: ConfirmReason;
  /** Receives the trimmed reason, or null when the dialog asks for none. A rejection keeps the dialog open. */
  onConfirm: (reason: string | null) => Promise<void>;
};

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  consequence,
  confirmLabel,
  destructive = false,
  reason,
  onConfirm,
}: ConfirmActionDialogProps): JSX.Element {
  const copy = useSharedAdminCopy(confirmActionCopy);
  const language = useAdminLanguageOrDefault();
  const [state, dispatch] = useReducer(confirmDialogReducer, INITIAL_CONFIRM_STATE);
  const inFlight = useRef(false);
  const required = reason !== "none";

  useEffect(() => {
    if (!open) dispatch({ type: "reset" });
  }, [open]);

  const submit = () =>
    runConfirm({ open, reason, state, inFlight, dispatch, onConfirm, onOpenChange });

  const hint = required ? copy.reasonHint(reason.minLength) : "";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Escape and the cancel button must not abandon a request that is running.
        if (!next && state.pending) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{consequence}</AlertDialogDescription>
        </AlertDialogHeader>
        {required && (
          <div className="grid gap-2">
            <label htmlFor="confirm-action-reason" className="text-sm font-medium">
              {copy.reasonLabel}
            </label>
            <Textarea
              id="confirm-action-reason"
              value={state.text}
              maxLength={CONFIRM_REASON_MAX_LENGTH}
              disabled={state.pending}
              aria-describedby={hint ? "confirm-action-reason-hint" : undefined}
              onChange={(event) => dispatch({ type: "edit", text: event.target.value })}
            />
            {hint && (
              <p id="confirm-action-reason-hint" className="text-sm text-muted-foreground">
                {hint}
              </p>
            )}
          </div>
        )}
        {state.failed && (
          <p role="alert" className="text-sm text-destructive">
            {adminErrorMessage(state.error, language) ?? copy.failed}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={state.pending}>{copy.cancel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm(reason, state.text, state.pending)}
            className={cn(destructive && buttonVariants({ variant: "destructive" }))}
            onClick={(event) => {
              // Radix closes the dialog on click; it must stay open until the request settles.
              event.preventDefault();
              void submit();
            }}
          >
            {state.pending ? copy.working : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
