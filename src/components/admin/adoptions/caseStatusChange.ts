import type { CoordinatorStatus } from "../../../lib/adoptions/types";
import { fetchCoordinatorJson } from "./api";

export type CaseStatusChangeRequest = {
  caseId: string;
  body: { statusId: string; note: string | undefined };
};

/** Whether the chosen status closes or rejects a case, which is when a reason is required. */
export function isClosingStatusChoice(
  statuses: readonly Pick<CoordinatorStatus, "id" | "isClosing">[],
  statusId: string,
): boolean {
  return statuses.some((status) => status.id === statusId && status.isClosing);
}

/**
 * What the case screen sends to change a case's status. A closing status needs the dialog's reason,
 * which travels as the note (null or blank builds nothing); any other status sends its optional note.
 */
export function caseStatusChangeRequest(args: {
  caseId: string;
  statusId: string;
  closing: boolean;
  note: string;
  reason: string | null;
}): CaseStatusChangeRequest | null {
  const text = (args.closing ? (args.reason ?? "") : args.note).trim();
  if (args.statusId === "" || (args.closing && text === "")) return null;
  return {
    caseId: args.caseId,
    body: { statusId: args.statusId, note: text === "" ? undefined : text },
  };
}

/**
 * The error the status form's inline alert shows. A failed closing change is already shown in the
 * reason dialog, which stays open on a failure, so the inline alert shows only a failed change to a
 * status that does not close.
 */
export function inlineCaseStatusFailure(
  statuses: readonly Pick<CoordinatorStatus, "id" | "isClosing">[],
  error: Error | null,
  request: CaseStatusChangeRequest | undefined,
): Error | null {
  if (!error) return null;
  if (request && isClosingStatusChoice(statuses, request.body.statusId)) return null;
  return error;
}

/** The POST itself, kept apart from the screen so a test can check the request body. */
export function sendCaseStatusChange(request: CaseStatusChangeRequest) {
  return fetchCoordinatorJson<{ ok: true }>(
    `/api/admin/adoptions/cases/${encodeURIComponent(request.caseId)}/status`,
    { method: "POST", body: JSON.stringify(request.body) },
  );
}
