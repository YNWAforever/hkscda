/**
 * The logic behind `ConfirmActionDialog`, apart from the component so that the component
 * file exports only a component (fast refresh) and tests can drive the logic directly.
 */

import { REQUIRED_REASON_MAX } from "@/lib/admin/requiredReason";

export type ConfirmReason = "none" | { required: true; minLength: number };

/** The longest reason the dialog accepts; the same cap the server-side reason schema enforces. */
export const CONFIRM_REASON_MAX_LENGTH = REQUIRED_REASON_MAX;

/** The dialog preset for an action that needs a reason: at least one non-blank character. */
export const requiredReasonDialog: ConfirmReason = { required: true, minLength: 1 };

/** Whether the confirm button may act: the reason is long enough and nothing is already running. */
export function canConfirm(reason: ConfirmReason, text: string, pending: boolean): boolean {
  if (pending) return false;
  if (reason === "none") return true;
  return text.trim().length >= reason.minLength;
}

export type ConfirmDialogState = {
  text: string;
  pending: boolean;
  /** What the last attempt rejected with, kept until the next attempt. */
  error: unknown;
  failed: boolean;
};

export type ConfirmDialogAction =
  | { type: "edit"; text: string }
  | { type: "start" }
  | { type: "rejected"; error: unknown }
  /** Clears the dialog; `text` is what the reason field holds when it next opens. */
  | { type: "reset"; text?: string };

export const INITIAL_CONFIRM_STATE: ConfirmDialogState = {
  text: "",
  pending: false,
  error: null,
  failed: false,
};

/**
 * The dialog's state. `start` while already pending changes nothing, which is what blocks a
 * second `onConfirm`; `rejected` keeps the typed reason so staff do not retype it.
 */
export function confirmDialogReducer(
  state: ConfirmDialogState,
  action: ConfirmDialogAction,
): ConfirmDialogState {
  switch (action.type) {
    case "edit":
      return { ...state, text: action.text.slice(0, CONFIRM_REASON_MAX_LENGTH) };
    case "start":
      return state.pending ? state : { ...state, pending: true, error: null, failed: false };
    case "rejected":
      return { ...state, pending: false, error: action.error, failed: true };
    case "reset":
      return action.text
        ? { ...INITIAL_CONFIRM_STATE, text: action.text.slice(0, CONFIRM_REASON_MAX_LENGTH) }
        : INITIAL_CONFIRM_STATE;
  }
}

export type RunConfirmArgs = {
  open: boolean;
  reason: ConfirmReason;
  state: ConfirmDialogState;
  /** Answers a second click that lands before the pending state has rendered. */
  inFlight: { current: boolean };
  dispatch: (action: ConfirmDialogAction) => void;
  onConfirm: (reason: string | null) => Promise<void>;
  onOpenChange: (open: boolean) => void;
};

/**
 * What a click on the confirm button does. It does nothing when the dialog is closed (a click
 * during the close fade), when a request is already running or when the reason is too short.
 * It closes the dialog when `onConfirm` resolves, and keeps it open with the text when it rejects.
 */
export async function runConfirm({
  open,
  reason,
  state,
  inFlight,
  dispatch,
  onConfirm,
  onOpenChange,
}: RunConfirmArgs): Promise<void> {
  if (!open) return;
  if (inFlight.current || !canConfirm(reason, state.text, state.pending)) return;
  inFlight.current = true;
  dispatch({ type: "start" });
  try {
    await onConfirm(reason === "none" ? null : state.text.trim());
    onOpenChange(false);
  } catch (error) {
    dispatch({ type: "rejected", error });
  } finally {
    inFlight.current = false;
  }
}
