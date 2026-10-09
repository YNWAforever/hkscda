/**
 * The logic behind `ConfirmActionDialog`, apart from the component so that the component
 * file exports only a component (fast refresh) and tests can drive the logic directly.
 */

export type ConfirmReason = "none" | { required: true; minLength: number };

/** The longest reason the dialog accepts. */
export const CONFIRM_REASON_MAX_LENGTH = 500;

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
  | { type: "reset" };

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
      return INITIAL_CONFIRM_STATE;
  }
}
